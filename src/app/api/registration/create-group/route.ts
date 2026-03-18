import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { groupRegistrationSchema } from "@/lib/validations/registration";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendConfirmationEmail, sendGroupReceiptEmail } from "@/lib/email/resend";
import { dispatchAdminNotification } from "@/lib/services/notification-dispatcher";
import { generateEntitlements, generateGroupEntitlements } from "@/lib/services/entitlement-generator";
import { autoAssignBed } from "@/lib/services/bed-auto-assign";
import { createRequestLogger } from "@/lib/logger";
import type { Event, PricingConfig } from "@/types/database";
import { formatSelectedDays } from "@/lib/date-utils";
import { randomUUID } from "crypto";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request, "create-group");
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`reg-create-group:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = groupRegistrationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
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
      return NextResponse.json({ error: "Pricing not configured" }, { status: 404 });
    }

    // Validate numDays for each registrant
    for (const reg of data.registrants) {
      if (!reg.isFullDuration && reg.numDays && reg.numDays > event.duration_days) {
        return NextResponse.json(
          { error: `Number of days cannot exceed event duration (${event.duration_days} days)` },
          { status: 400 }
        );
      }
    }

    // Compute group pricing (surcharge applied once on total)
    const serverRegistrationDate = new Date().toISOString();
    const groupPricing = computeGroupPricing(
      data.registrants.map((r) => ({
        dateOfBirth: r.dateOfBirth,
        isFullDuration: r.isFullDuration,
        isStayingInMotel: r.isStayingInMotel,
        numDays: r.isFullDuration ? undefined : r.numDays,
        selectedDays: r.selectedDays,
        attendanceType: r.attendanceType,
        registrationDate: serverRegistrationDate,
      })),
      event,
      pricing
    );

    // Compute meal costs per registrant
    const mealCostsPerRegistrant = data.registrants.map((reg, i) => {
      const mealCount = reg.mealServiceIds?.length ?? 0;
      const pricePerMeal = groupPricing.items[i].category === "child"
        ? pricing.meal_price_child
        : pricing.meal_price_adult;
      return mealCount * pricePerMeal;
    });
    const mealGrandTotal = mealCostsPerRegistrant.reduce((s, c) => s + c, 0);

    // ─── Server-enforced duplicate check ───
    const adminClient = createAdminClient();
    const duplicateNames = data.registrants.map((r) => ({
      first: r.firstName.toLowerCase().trim(),
      last: r.lastName.toLowerCase().trim(),
    }));

    const { data: existingRegs } = await adminClient
      .from("registrations")
      .select("first_name, last_name, email, status")
      .eq("event_id", data.eventId)
      .ilike("email", data.email.trim())
      .in("status", ["pending", "confirmed"]);

    if (existingRegs && existingRegs.length > 0) {
      const dupes = duplicateNames.filter((n) =>
        existingRegs.some(
          (e) =>
            e.first_name.toLowerCase().trim() === n.first &&
            e.last_name.toLowerCase().trim() === n.last
        )
      );
      if (dupes.length > 0) {
        const names = dupes.map((d) => `${d.first} ${d.last}`).join(", ");
        return NextResponse.json(
          { error: `Duplicate registration(s) found for: ${names}. They already have an active registration for this event.` },
          { status: 409 }
        );
      }
    }

    // Get current user if authenticated
    const { data: { user } } = await supabase.auth.getUser();

    // Always generate group_id for the group flow (ensures review page shows all registrants)
    const groupId = randomUUID();
    const isFreeGroup = (groupPricing.grandTotal + mealGrandTotal) === 0;

    // Generate confirmation codes via DB function
    const confirmationCodes: string[] = [];
    for (const reg of data.registrants) {
      const { data: codeResult } = await adminClient.rpc("generate_confirmation_code", {
        p_first_name: reg.firstName,
        p_last_name: reg.lastName,
        p_event_id: data.eventId,
      });
      const initials = (reg.firstName.charAt(0) + reg.lastName.charAt(0)).toUpperCase();
      confirmationCodes.push(codeResult ?? `MW26-${initials}-${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`);
    }

    // Derive attendance_type and access_tier
    function deriveAttendanceType(reg: typeof data.registrants[number]): string {
      return reg.attendanceType ?? (reg.isFullDuration ? "full_conference" : "partial");
    }
    function deriveAccessTier(attendanceType: string): string {
      if (attendanceType === "kote") return "KOTE_ACCESS";
      return "FULL_ACCESS";
    }

    // Create all registrations
    const registrationRows = data.registrants.map((reg, i) => {
      const attType = deriveAttendanceType(reg);
      return {
        event_id: data.eventId,
        user_id: user?.id ?? null,
        group_id: groupId,
        first_name: reg.firstName,
        last_name: reg.lastName,
        email: data.email,
        phone: data.phone,
        date_of_birth: reg.dateOfBirth,
        age_at_event: groupPricing.items[i].ageAtEvent,
        category: groupPricing.items[i].category,
        is_full_duration: reg.isFullDuration,
        is_staying_in_motel: reg.isStayingInMotel ?? null,
        num_days: reg.numDays ?? null,
        selected_days: reg.selectedDays ?? null,
        computed_amount: groupPricing.items[i].amount,
        explanation_code: groupPricing.items[i].explanationCode,
        explanation_detail: groupPricing.items[i].explanationDetail,
        status: isFreeGroup ? "confirmed" : "pending",
        confirmed_at: isFreeGroup ? new Date().toISOString() : null,
        gender: reg.gender ?? null,
        city: reg.city ?? null,
        church_id: reg.churchId ?? null,
        church_name_custom: reg.churchNameCustom ?? null,
        attendance_type: attType,
        public_confirmation_code: confirmationCodes[i],
        access_tier: deriveAccessTier(attType),
        selected_meal_ids: reg.mealServiceIds?.length ? reg.mealServiceIds : null,
        tshirt_size: reg.tshirtSize ?? null,
      };
    });

    const { data: registrations, error: regError } = await adminClient
      .from("registrations")
      .insert(registrationRows)
      .select();

    if (regError || !registrations) {
      // Handle unique constraint violation from DB index
      if (regError?.code === "23505") {
        return NextResponse.json(
          { error: "Duplicate registration detected. One or more registrants already have an active registration for this event." },
          { status: 409 }
        );
      }
      log.error("Group registration create error", { error: regError?.message, code: regError?.code });
      return NextResponse.json(
        { error: "Failed to create registrations" },
        { status: 500 }
      );
    }

    // ─── Auto-assign beds based on city→dorm mapping ───
    // KOTE users are off-campus / walk-in — skip auto-assignment
    const bedAssignments = new Map<string, { dormName: string; bedLabel: string }>();
    for (let i = 0; i < registrations.length; i++) {
      const reg = registrations[i];

      if (reg.attendance_type === "kote") {
        log.debug("Skipping bed auto-assignment for KOTE user", { registrationId: reg.id });
        continue;
      }

      let city = reg.city;

      // If no city on registration, resolve from church
      if (!city && reg.church_id) {
        const { data: church } = await adminClient
          .from("churches")
          .select("city")
          .eq("id", reg.church_id)
          .single();
        city = church?.city ?? null;
      }

      if (city) {
        try {
          const result = await autoAssignBed(adminClient, {
            registrationId: reg.id,
            eventId: data.eventId,
            city,
            assignedBy: "system_public_registration",
          });
          if (result) {
            bedAssignments.set(reg.id, { dormName: result.motelName, bedLabel: result.bedLabel });
            log.info("Bed auto-assigned", {
              registrationId: reg.id,
              city,
              motel: result.motelName,
              bed: result.bedLabel,
            });
          } else {
            log.warn("No available bed for auto-assignment", {
              registrationId: reg.id,
              city,
            });
          }
        } catch (e) {
          log.error("Bed auto-assignment failed", {
            registrationId: reg.id,
            city,
            error: String(e),
          });
        }
      }
    }

    // Generate service entitlements for free registrations (paid ones get entitlements via webhook)
    if (isFreeGroup) {
      try {
        await generateGroupEntitlements(adminClient, groupId, data.eventId, log);
      } catch (e) {
        log.error("Free group entitlement generation failed", { groupId, error: String(e) });
      }
    }

    // Send confirmation email for free registrations
    if (isFreeGroup) {
      try {
        if (registrations.length === 1) {
          const r = registrations[0];
          const ba = bedAssignments.get(r.id);
          await sendConfirmationEmail({
            to: data.email,
            firstName: r.first_name,
            lastName: r.last_name,
            eventName: event.name,
            amount: Number(r.computed_amount),
            isFree: true,
            registrationId: r.id,
            explanationDetail: r.explanation_detail,
            category: r.category,
            accessTier: r.access_tier,
            attendanceType: r.attendance_type,
            selectedDays: r.selected_days,
            dormName: ba?.dormName ?? null,
            bedLabel: ba?.bedLabel ?? null,
            selectedMealIds: r.selected_meal_ids,
            mealTotal: (() => {
              const ids = r.selected_meal_ids;
              if (!ids || ids.length === 0) return 0;
              const price = r.category === "child" ? pricing.meal_price_child : pricing.meal_price_adult;
              return ids.length * price;
            })(),
            tshirtSize: r.tshirt_size ?? null,
          });
          log.info("Free solo confirmation email sent", { registrationId: r.id });
          await adminClient.from("email_logs").insert({
            recipient: data.email,
            email_type: "confirmation_free",
            registration_id: r.id,
            status: "sent",
          });
        } else {
          function attendanceLabel(r: { is_full_duration: boolean; is_staying_in_motel: boolean | null; num_days: number | null; selected_days: number[] | null; attendance_type: string }): string {
            if (r.is_full_duration) return "Full Conference";
            if (r.selected_days && r.selected_days.length > 0 && event?.start_date) {
              const dayStr = formatSelectedDays(event.start_date, r.selected_days);
              return r.attendance_type === "kote" ? `KOTE · ${dayStr}` : dayStr;
            }
            return `${r.num_days} Day(s)`;
          }

          await sendGroupReceiptEmail({
            to: data.email,
            eventName: event.name,
            members: registrations.map((r) => {
              const ba = bedAssignments.get(r.id);
              return {
                firstName: r.first_name,
                lastName: r.last_name,
                category: r.category,
                ageAtEvent: r.age_at_event,
                amount: Number(r.computed_amount),
                attendance: attendanceLabel(r),
                attendanceType: r.attendance_type,
                accessTier: r.access_tier,
                selectedDays: r.selected_days,
                dormName: ba?.dormName ?? null,
                bedLabel: ba?.bedLabel ?? null,
                selectedMealIds: r.selected_meal_ids,
                mealCount: r.selected_meal_ids?.length ?? 0,
                tshirtSize: r.tshirt_size ?? null,
              };
            }),
            subtotal: groupPricing.subtotal,
            surcharge: groupPricing.surcharge,
            surchargeLabel: groupPricing.surchargeLabel,
            mealTotal: mealGrandTotal,
            grandTotal: groupPricing.grandTotal + mealGrandTotal,
            isFree: true,
            primaryRegistrationId: registrations[0].id,
          });
          log.info("Free group receipt email sent", { groupId, memberCount: registrations.length });
          await adminClient.from("email_logs").insert({
            recipient: data.email,
            email_type: "group_receipt_free",
            group_id: groupId,
            status: "sent",
          });
        }
      } catch (err) {
        log.error("Free registration email failed", { groupId, error: err instanceof Error ? err.message : String(err) });
        await adminClient.from("email_logs").insert({
          recipient: data.email,
          email_type: registrations.length === 1 ? "confirmation_free" : "group_receipt_free",
          group_id: groupId,
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        });
      }

      // Notify admins (independent — fires even if confirmation email failed)
      await new Promise((r) => setTimeout(r, 600));
      function freeAttendanceLabel(r: { is_full_duration: boolean; is_staying_in_motel: boolean | null; num_days: number | null; attendance_type?: string }): string {
        const at = (r as Record<string, unknown>).attendance_type as string | undefined;
        if (at === "kote") return "KOTE";
        if (r.is_full_duration) return "Full Conference";
        return `${r.num_days} Day(s)`;
      }

      await dispatchAdminNotification(adminClient, {
        eventName: event.name,
        eventStartDate: event.start_date,
        eventEndDate: event.end_date,
        registrantEmail: data.email,
        members: registrations.map((r) => ({
          firstName: r.first_name,
          lastName: r.last_name,
          category: r.category,
          amount: Number(r.computed_amount),
          attendance: freeAttendanceLabel(r),
          confirmationCode: r.public_confirmation_code,
        })),
        grandTotal: groupPricing.grandTotal,
        isFree: true,
        isPaid: false,
        groupId,
        primaryRegistrationId: registrations[0].id,
        registeredAt: new Date().toISOString(),
      }, log);
    }

    return NextResponse.json({
      groupId,
      registrations,
      subtotal: groupPricing.subtotal,
      surcharge: groupPricing.surcharge,
      surchargeLabel: groupPricing.surchargeLabel,
      mealTotal: mealGrandTotal,
      grandTotal: groupPricing.grandTotal + mealGrandTotal,
    });
  } catch (error) {
    log.error("Group registration error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
