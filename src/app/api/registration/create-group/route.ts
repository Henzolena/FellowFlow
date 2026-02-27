import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGroupPricing } from "@/lib/pricing/engine";
import { groupRegistrationSchema } from "@/lib/validations/registration";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendConfirmationEmail } from "@/lib/email/resend";
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
    const groupPricing = computeGroupPricing(
      data.registrants.map((r) => ({
        dateOfBirth: r.dateOfBirth,
        isFullDuration: r.isFullDuration,
        isStayingInMotel: r.isStayingInMotel,
        numDays: r.isFullDuration ? undefined : r.numDays,
      })),
      event,
      pricing
    );

    // Get current user if authenticated
    const { data: { user } } = await supabase.auth.getUser();
    const adminClient = createAdminClient();

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
      console.error("Group registration create error:", regError);
      return NextResponse.json(
        { error: "Failed to create registrations" },
        { status: 500 }
      );
    }

    // Send confirmation emails for free group registrations
    if (isFreeGroup) {
      for (const reg of registrations) {
        sendConfirmationEmail({
          to: reg.email,
          firstName: reg.first_name,
          lastName: reg.last_name,
          eventName: event.name,
          amount: 0,
          isFree: true,
          registrationId: reg.id,
          explanationDetail: reg.explanation_detail,
        }).catch(() => {});
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
