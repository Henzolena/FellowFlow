import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computeGroupPricing } from "@/lib/pricing/engine";
import type { Registration, Event, PricingConfig } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { registrationId, groupId, surcharge: clientSurcharge } = body;

    if (!registrationId && !groupId) {
      return NextResponse.json(
        { error: "Registration ID or Group ID required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // ─── Group payment flow ───
    if (groupId) {
      return handleGroupPayment(supabase, groupId, clientSurcharge, appUrl);
    }

    // ─── Solo payment flow (backwards compatible) ───
    return handleSoloPayment(supabase, registrationId, appUrl);
  } catch (error) {
    console.error("Payment session error:", error);
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
  appUrl: string
) {
  const { data: registration, error } = await supabase
    .from("registrations")
    .select("*, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold)")
    .eq("id", registrationId)
    .single<
      Registration & {
        events: Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold">;
      }
    >();

  if (error || !registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  if (registration.status === "confirmed") {
    return NextResponse.json({ error: "Registration already confirmed" }, { status: 400 });
  }

  if (registration.computed_amount === 0) {
    return NextResponse.json({ error: "No payment required for free registrations" }, { status: 400 });
  }

  // Check for existing pending payment
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, stripe_session_id, status")
    .eq("registration_id", registrationId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPayment?.stripe_session_id) {
    const stripe = getStripe();
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(existingPayment.stripe_session_id);
      if (existingSession.status === "open" && existingSession.url) {
        return NextResponse.json({ sessionId: existingSession.id, url: existingSession.url });
      }
    } catch {
      // Session expired — continue
    }
  }

  const idempotencyKey = `reg_${registrationId}`;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Registration: ${registration.events.name}`,
            description: `${registration.first_name} ${registration.last_name} — ${registration.explanation_detail}`,
          },
          unit_amount: Math.round(Number(registration.computed_amount) * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${appUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&registration_id=${registrationId}&ln=${encodeURIComponent(registration.last_name)}`,
    cancel_url: `${appUrl}/register/review?registration_id=${registrationId}&ln=${encodeURIComponent(registration.last_name)}&cancelled=true`,
    customer_email: registration.email,
    metadata: {
      registration_id: registrationId,
      idempotency_key: idempotencyKey,
    },
  });

  if (existingPayment) {
    await supabase.from("payments").update({
      stripe_session_id: session.id,
      amount: registration.computed_amount,
      idempotency_key: idempotencyKey,
    }).eq("id", existingPayment.id);
  } else {
    await supabase.from("payments").insert({
      registration_id: registrationId,
      stripe_session_id: session.id,
      amount: registration.computed_amount,
      currency: "usd",
      status: "pending",
      idempotency_key: idempotencyKey,
    });
  }

  return NextResponse.json({ sessionId: session.id, url: session.url });
}

/* ------------------------------------------------------------------ */
/*  Group payment (multiple registrations, one checkout)               */
/* ------------------------------------------------------------------ */
async function handleGroupPayment(
  supabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  clientSurcharge: number | undefined,
  appUrl: string
) {
  // Fetch all registrations in the group
  const { data: registrations, error } = await supabase
    .from("registrations")
    .select("*, events(name, start_date, end_date, duration_days, adult_age_threshold, youth_age_threshold)")
    .eq("group_id", groupId)
    .eq("status", "pending");

  if (error || !registrations || registrations.length === 0) {
    return NextResponse.json({ error: "Group registrations not found" }, { status: 404 });
  }

  // Verify none are already confirmed
  const alreadyConfirmed = registrations.some((r: Registration) => r.status === "confirmed");
  if (alreadyConfirmed) {
    return NextResponse.json({ error: "Some registrations already confirmed" }, { status: 400 });
  }

  const primaryReg = registrations[0];
  const eventData = primaryReg.events as unknown as Pick<Event, "name" | "start_date" | "end_date" | "duration_days" | "adult_age_threshold" | "youth_age_threshold">;

  // Recompute group pricing server-side
  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("*")
    .eq("event_id", primaryReg.event_id)
    .single<PricingConfig>();

  let surcharge = 0;
  let surchargeLabel: string | null = null;

  if (pricing) {
    const groupResult = computeGroupPricing(
      registrations.map((r: Registration) => ({
        dateOfBirth: r.date_of_birth,
        isFullDuration: r.is_full_duration,
        isStayingInMotel: r.is_staying_in_motel ?? undefined,
        numDays: r.num_days ?? undefined,
      })),
      { ...eventData, id: primaryReg.event_id, is_active: true, created_at: "", updated_at: "", description: null } as Event,
      pricing
    );
    surcharge = groupResult.surcharge;
    surchargeLabel = groupResult.surchargeLabel;
  }

  // Build line items — one per registrant + optional surcharge
  const lineItems = registrations.map((r: Registration) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: `${r.first_name} ${r.last_name}`,
        description: r.explanation_detail || `Registration for ${eventData.name}`,
      },
      unit_amount: Math.round(Number(r.computed_amount) * 100),
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

  const subtotal = registrations.reduce((sum: number, r: Registration) => sum + Number(r.computed_amount), 0);
  const grandTotal = subtotal + surcharge;

  if (grandTotal === 0) {
    return NextResponse.json({ error: "No payment required" }, { status: 400 });
  }

  const idempotencyKey = `group_${groupId}`;
  const stripe = getStripe();

  // Check for existing group payment
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, stripe_session_id, status")
    .eq("registration_id", primaryReg.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPayment?.stripe_session_id) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(existingPayment.stripe_session_id);
      if (existingSession.status === "open" && existingSession.url) {
        return NextResponse.json({ sessionId: existingSession.id, url: existingSession.url });
      }
    } catch {
      // continue
    }
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    success_url: `${appUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&group_id=${groupId}&registration_id=${primaryReg.id}&ln=${encodeURIComponent(primaryReg.last_name)}`,
    cancel_url: `${appUrl}/register/review?group_id=${groupId}&registration_id=${primaryReg.id}&ln=${encodeURIComponent(primaryReg.last_name)}&cancelled=true`,
    customer_email: primaryReg.email,
    metadata: {
      group_id: groupId,
      registration_id: primaryReg.id,
      idempotency_key: idempotencyKey,
    },
  });

  // Create payment record linked to primary registration
  if (existingPayment) {
    await supabase.from("payments").update({
      stripe_session_id: session.id,
      amount: grandTotal,
      idempotency_key: idempotencyKey,
    }).eq("id", existingPayment.id);
  } else {
    await supabase.from("payments").insert({
      registration_id: primaryReg.id,
      stripe_session_id: session.id,
      amount: grandTotal,
      currency: "usd",
      status: "pending",
      idempotency_key: idempotencyKey,
    });
  }

  return NextResponse.json({ sessionId: session.id, url: session.url });
}
