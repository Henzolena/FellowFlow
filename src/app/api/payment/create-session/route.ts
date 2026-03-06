import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionSchema } from "@/lib/validations/api";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createRequestLogger } from "@/lib/logger";
import { recomputeSoloPricing, recomputeGroupPricing } from "@/lib/services/pricing-recomputer";
import { reuseExistingSession, createAndPersistSession } from "@/lib/services/session-manager";
import type { Registration, Event, PricingConfig } from "@/types/database";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request, "create-session");
  try {
    const ip = getClientIp(request);
    const rl = rateLimit(`create-session:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { registrationId, groupId } = parsed.data;
    const supabase = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (groupId) {
      return handleGroupPayment(supabase, groupId, appUrl, log);
    }

    return handleSoloPayment(supabase, registrationId!, appUrl, log);
  } catch (error) {
    log.error("Payment session error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to create payment session" },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Solo payment (single registration)                                 */
/* ------------------------------------------------------------------ */
async function handleSoloPayment(
  supabase: ReturnType<typeof createAdminClient>,
  registrationId: string,
  appUrl: string,
  log: ReturnType<typeof createRequestLogger>
) {
  const { data: registration, error } = await supabase
    .from("registrations")
    .select("*, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)")
    .eq("id", registrationId)
    .single<
      Registration & {
        events: Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;
      }
    >();

  if (error || !registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  if (registration.status === "confirmed") {
    return NextResponse.json({ error: "Registration already confirmed" }, { status: 400 });
  }

  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("*")
    .eq("event_id", registration.event_id)
    .single<PricingConfig>();

  if (!pricing) {
    return NextResponse.json({ error: "Pricing not configured" }, { status: 404 });
  }

  const recomputed = await recomputeSoloPricing(supabase, registration, pricing, log);

  if (recomputed.amount === 0) {
    return NextResponse.json({ error: "No payment required for free registrations" }, { status: 400 });
  }

  // Reuse existing open Stripe session if available
  const existing = await reuseExistingSession(supabase, registrationId, log);
  if (existing) {
    return NextResponse.json(existing);
  }

  const ln = encodeURIComponent(registration.last_name);
  const result = await createAndPersistSession({
    supabase,
    log,
    registrationId,
    customerEmail: registration.email,
    amount: recomputed.amount,
    lineItems: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Registration: ${registration.events.name}`,
            description: `${registration.first_name} ${registration.last_name} \u2014 ${recomputed.explanationDetail}`,
          },
          unit_amount: Math.round(recomputed.amount * 100),
        },
        quantity: 1,
      },
    ],
    successUrl: `${appUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&registration_id=${registrationId}&ln=${ln}`,
    cancelUrl: `${appUrl}/register/review?registration_id=${registrationId}&ln=${ln}&cancelled=true`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ sessionId: result.sessionId, url: result.url });
}

/* ------------------------------------------------------------------ */
/*  Group payment (multiple registrations, one checkout)               */
/* ------------------------------------------------------------------ */
async function handleGroupPayment(
  supabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  appUrl: string,
  log: ReturnType<typeof createRequestLogger>
) {
  const { data: registrations, error } = await supabase
    .from("registrations")
    .select("*, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold, infant_age_threshold)")
    .eq("group_id", groupId)
    .eq("status", "pending");

  if (error || !registrations || registrations.length === 0) {
    return NextResponse.json({ error: "Group registrations not found" }, { status: 404 });
  }

  const primaryReg = registrations[0];
  const eventData = primaryReg.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold" | "infant_age_threshold">;

  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("*")
    .eq("event_id", primaryReg.event_id)
    .single<PricingConfig>();

  if (!pricing) {
    return NextResponse.json({ error: "Pricing not configured" }, { status: 404 });
  }

  const groupResult = await recomputeGroupPricing(supabase, registrations, pricing, log);
  const { surcharge, surchargeLabel, grandTotal } = groupResult;

  if (grandTotal === 0) {
    return NextResponse.json({ error: "No payment required" }, { status: 400 });
  }

  // Reuse existing open Stripe session if available
  const existing = await reuseExistingSession(supabase, primaryReg.id, log);
  if (existing) {
    return NextResponse.json(existing);
  }

  // Build line items from recomputed amounts
  const lineItems = registrations.map((r: Registration, i: number) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: `${r.first_name} ${r.last_name}`,
        description: groupResult.items[i].explanationDetail || `Registration for ${eventData.name}`,
      },
      unit_amount: Math.round(groupResult.items[i].amount * 100),
    },
    quantity: 1,
  }));

  if (surcharge > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: surchargeLabel || "Late Registration Surcharge",
          description: "Applied once to the group total",
        },
        unit_amount: Math.round(surcharge * 100),
      },
      quantity: 1,
    });
  }

  const ln = encodeURIComponent(primaryReg.last_name);
  const result = await createAndPersistSession({
    supabase,
    log,
    registrationId: primaryReg.id,
    groupId,
    customerEmail: primaryReg.email,
    amount: grandTotal,
    lineItems,
    successUrl: `${appUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&group_id=${groupId}&registration_id=${primaryReg.id}&ln=${ln}`,
    cancelUrl: `${appUrl}/register/review?group_id=${groupId}&registration_id=${primaryReg.id}&ln=${ln}&cancelled=true`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ sessionId: result.sessionId, url: result.url });
}
