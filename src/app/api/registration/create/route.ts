import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePricing } from "@/lib/pricing/engine";
import { registrationSchema } from "@/lib/validations/registration";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendConfirmationEmail } from "@/lib/email/resend";
import type { Event, PricingConfig } from "@/types/database";

// 10 registrations per 60 seconds per IP (stricter than quote)
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
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

    // Create registration
    const { data: registration, error: regError } = await adminClient
      .from("registrations")
      .insert({
        event_id: data.eventId,
        user_id: user?.id ?? null,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        date_of_birth: data.dateOfBirth,
        age_at_event: pricingResult.ageAtEvent,
        category: pricingResult.category,
        is_full_duration: data.isFullDuration,
        is_staying_in_motel: data.isStayingInMotel ?? null,
        num_days: data.numDays ?? null,
        computed_amount: pricingResult.amount,
        explanation_code: pricingResult.explanationCode,
        explanation_detail: pricingResult.explanationDetail,
        status: pricingResult.amount === 0 ? "confirmed" : "pending",
        confirmed_at: pricingResult.amount === 0 ? new Date().toISOString() : null,
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
        explanationDetail: pricingResult.explanationDetail,
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({ registration });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
