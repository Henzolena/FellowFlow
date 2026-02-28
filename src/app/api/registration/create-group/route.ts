import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { groupRegistrationSchema } from "@/lib/validations/registration";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendConfirmationEmail, sendGroupReceiptEmail } from "@/lib/email/resend";
import type { Event, PricingConfig } from "@/types/database";
import { randomUUID } from "crypto";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
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
        registrationDate: serverRegistrationDate,
      })),
      event,
      pricing
    );

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
    const isFreeGroup = groupPricing.grandTotal === 0;

    // Create all registrations
    const registrationRows = data.registrants.map((reg, i) => ({
      event_id: data.eventId,
      user_id: user?.id ?? null,
      group_id: groupId,
      first_name: reg.firstName,
      last_name: reg.lastName,
      email: data.email,
      phone: data.phone ?? null,
      date_of_birth: reg.dateOfBirth,
      age_at_event: groupPricing.items[i].ageAtEvent,
      category: groupPricing.items[i].category,
      is_full_duration: reg.isFullDuration,
      is_staying_in_motel: reg.isStayingInMotel ?? null,
      num_days: reg.numDays ?? null,
      computed_amount: groupPricing.items[i].amount,
      explanation_code: groupPricing.items[i].explanationCode,
      explanation_detail: groupPricing.items[i].explanationDetail,
      status: isFreeGroup ? "confirmed" : "pending",
      confirmed_at: isFreeGroup ? new Date().toISOString() : null,
    }));

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
      console.error("Group registration create error:", regError);
      return NextResponse.json(
        { error: "Failed to create registrations" },
        { status: 500 }
      );
    }

    // Send confirmation email for free registrations
    if (isFreeGroup) {
      if (registrations.length === 1) {
        // Solo registrant — send individual confirmation email
        const r = registrations[0];
        sendConfirmationEmail({
          to: data.email,
          firstName: r.first_name,
          lastName: r.last_name,
          eventName: event.name,
          amount: Number(r.computed_amount),
          isFree: true,
          registrationId: r.id,
          explanationDetail: r.explanation_detail,
        }).then(() => {
          adminClient.from("email_logs").insert({
            recipient: data.email,
            email_type: "confirmation_free",
            registration_id: r.id,
            status: "sent",
          });
        }).catch((err) => {
          console.error("Free solo confirmation email failed:", err);
          adminClient.from("email_logs").insert({
            recipient: data.email,
            email_type: "confirmation_free",
            registration_id: r.id,
            status: "failed",
            error_message: err instanceof Error ? err.message : String(err),
          });
        });
      } else {
        // Multiple registrants — send consolidated group receipt
        function attendanceLabel(r: { is_full_duration: boolean; is_staying_in_motel: boolean | null; num_days: number | null }): string {
          if (r.is_full_duration) return "Full Conference";
          if (r.is_staying_in_motel) return "Partial — Motel";
          return `${r.num_days} Day(s)`;
        }

        sendGroupReceiptEmail({
          to: data.email,
          eventName: event.name,
          members: registrations.map((r) => ({
            firstName: r.first_name,
            lastName: r.last_name,
            category: r.category,
            ageAtEvent: r.age_at_event,
            amount: Number(r.computed_amount),
            attendance: attendanceLabel(r),
          })),
          subtotal: groupPricing.subtotal,
          surcharge: groupPricing.surcharge,
          surchargeLabel: groupPricing.surchargeLabel,
          grandTotal: groupPricing.grandTotal,
          isFree: true,
          primaryRegistrationId: registrations[0].id,
        }).then(() => {
          adminClient.from("email_logs").insert({
            recipient: data.email,
            email_type: "group_receipt_free",
            group_id: groupId,
            status: "sent",
          });
        }).catch((err) => {
          console.error("Free group receipt email failed:", err);
          adminClient.from("email_logs").insert({
            recipient: data.email,
            email_type: "group_receipt_free",
            group_id: groupId,
            status: "failed",
            error_message: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    return NextResponse.json({
      groupId,
      registrations,
      subtotal: groupPricing.subtotal,
      surcharge: groupPricing.surcharge,
      surchargeLabel: groupPricing.surchargeLabel,
      grandTotal: groupPricing.grandTotal,
    });
  } catch (error) {
    console.error("Group registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
