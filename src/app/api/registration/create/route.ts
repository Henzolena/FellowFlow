import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePricing } from "@/lib/pricing/engine";
import { registrationSchema } from "@/lib/validations/registration";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendConfirmationEmail } from "@/lib/email/resend";
import { autoAssignBed } from "@/lib/services/bed-auto-assign";
import { createRequestLogger } from "@/lib/logger";
import type { Event, PricingConfig } from "@/types/database";

// 10 registrations per 60 seconds per IP (stricter than quote)
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request, "create-solo");
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`reg-create:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.success) {
      console.warn(`Rate limit hit: registration-create from ${ip}`);
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        }
      );
    }

    const body = await request.json();
    const parsed = registrationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    
    // Use public client for reads (respects RLS for active events)
    const supabase = await createClient();

    // Get event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", data.eventId)
      .eq("is_active", true)
      .single<Event>();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Get pricing
    const { data: pricing, error: pricingError } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("event_id", data.eventId)
      .single<PricingConfig>();

    if (pricingError || !pricing) {
      return NextResponse.json(
        { error: "Pricing not configured" },
        { status: 404 }
      );
    }

    // Validate numDays doesn't exceed event duration
    if (!data.isFullDuration && data.numDays && data.numDays > event.duration_days) {
      return NextResponse.json(
        { error: `Number of days cannot exceed event duration (${event.duration_days} days)` },
        { status: 400 }
      );
    }

    // Server-side pricing computation (source of truth)
    const pricingResult = computePricing(
      {
        dateOfBirth: data.dateOfBirth,
        isFullDuration: data.isFullDuration,
        isStayingInMotel: data.isStayingInMotel,
        numDays: data.numDays,
        selectedDays: data.selectedDays,
      },
      event,
      pricing
    );

    // Get current user if authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Use admin client for INSERT to support anonymous registrations
    // (bypasses RLS — anonymous users can't pass RLS INSERT policies)
    const adminClient = createAdminClient();

    // Generate public confirmation code
    const { data: codeResult } = await adminClient.rpc("generate_confirmation_code", {
      p_first_name: data.firstName,
      p_last_name: data.lastName,
      p_event_id: data.eventId,
    });
    const initials = (data.firstName.charAt(0) + data.lastName.charAt(0)).toUpperCase();
    const publicCode = codeResult ?? `MW26-${initials}-${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;

    // Derive attendance type and access tier
    const attendanceType = data.attendanceType ?? (data.isFullDuration ? "full_conference" : "partial");
    const accessTier = attendanceType === "kote" ? "KOTE_ACCESS" : "FULL_ACCESS";

    // Create registration
    const { data: registration, error: regError } = await adminClient
      .from("registrations")
      .insert({
        event_id: data.eventId,
        user_id: user?.id ?? null,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        date_of_birth: data.dateOfBirth,
        age_at_event: pricingResult.ageAtEvent,
        category: pricingResult.category,
        is_full_duration: data.isFullDuration,
        is_staying_in_motel: data.isStayingInMotel ?? null,
        num_days: data.numDays ?? null,
        selected_days: data.selectedDays ?? null,
        computed_amount: pricingResult.amount,
        explanation_code: pricingResult.explanationCode,
        explanation_detail: pricingResult.explanationDetail,
        status: pricingResult.amount === 0 ? "confirmed" : "pending",
        confirmed_at: pricingResult.amount === 0 ? new Date().toISOString() : null,
        public_confirmation_code: publicCode,
        attendance_type: attendanceType,
        access_tier: accessTier,
        gender: data.gender ?? null,
        city: data.city ?? null,
        church_id: data.churchId ?? null,
        church_name_custom: data.churchNameCustom ?? null,
        selected_meal_ids: data.mealServiceIds?.length ? data.mealServiceIds : null,
        tshirt_size: data.tshirtSize ?? null,
        service_language: data.serviceLanguage ?? null,
        service_age_band: data.serviceAgeBand ?? null,
        grade_level: data.gradeLevel ?? null,
      })
      .select()
      .single();

    if (regError) {
      console.error("Registration create error:", regError);
      return NextResponse.json(
        { error: "Failed to create registration" },
        { status: 500 }
      );
    }

    // ─── Auto-assign bed based on city→dorm mapping ───
    // KOTE users are off-campus / walk-in — skip auto-assignment
    let bedAssignment: { dormName: string; bedLabel: string } | null = null;
    if (registration && attendanceType !== "kote") {
      let city = data.city ?? null;

      // If no city on registration, resolve from church
      if (!city && data.churchId) {
        const { data: church } = await adminClient
          .from("churches")
          .select("city")
          .eq("id", data.churchId)
          .single();
        city = church?.city ?? null;
      }

      if (city) {
        try {
          const result = await autoAssignBed(adminClient, {
            registrationId: registration.id,
            eventId: data.eventId,
            city,
            gender: data.gender ?? null,
            assignedBy: "system_public_registration",
          });
          if (result) {
            bedAssignment = { dormName: result.motelName, bedLabel: result.bedLabel };
            log.info("Bed auto-assigned", {
              registrationId: registration.id,
              city,
              motel: result.motelName,
              bed: result.bedLabel,
            });
          } else {
            log.warn("No available bed for auto-assignment", {
              registrationId: registration.id,
              city,
            });
          }
        } catch (e) {
          log.error("Bed auto-assignment failed", {
            registrationId: registration.id,
            city,
            error: String(e),
          });
        }
      }
    }

    // Send confirmation email for free registrations immediately
    if (pricingResult.amount === 0 && registration) {
      sendConfirmationEmail({
        to: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        eventName: event.name,
        amount: 0,
        isFree: true,
        registrationId: registration.id,
        secureToken: registration.secure_token,
        explanationDetail: pricingResult.explanationDetail,
        category: registration.category,
        accessTier: registration.access_tier,
        attendanceType: registration.attendance_type,
        dormName: bedAssignment?.dormName ?? null,
        bedLabel: bedAssignment?.bedLabel ?? null,
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({ registration, bedAssignment });
  } catch (error) {
    console.error("Registration error:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
