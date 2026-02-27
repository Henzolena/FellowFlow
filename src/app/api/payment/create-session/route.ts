import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { computePricing } from "@/lib/pricing/engine";
import type { Registration, Event, PricingConfig } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const { registrationId } = await request.json();

    if (!registrationId) {
      return NextResponse.json(
        { error: "Registration ID required" },
        { status: 400 }
      );
    }

    // Use admin client — RLS no longer allows public SELECT on registrations
    const supabase = createAdminClient();

    // Fetch registration with event name
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
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    if (registration.status === "confirmed") {
      return NextResponse.json(
        { error: "Registration already confirmed" },
        { status: 400 }
      );
    }

    if (registration.computed_amount === 0) {
      return NextResponse.json(
        { error: "No payment required for free registrations" },
        { status: 400 }
      );
    }

    // Check for existing pending payment (prevent duplicate sessions)
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id, stripe_session_id, status")
      .eq("registration_id", registrationId)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPayment?.stripe_session_id) {
      // Return existing session — don't create duplicates
      const stripe = getStripe();
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(
          existingPayment.stripe_session_id
        );
        if (existingSession.status === "open" && existingSession.url) {
          return NextResponse.json({
            sessionId: existingSession.id,
            url: existingSession.url,
          });
        }
      } catch {
        // Session expired or invalid — continue to create new one
      }
    }

    /* ------------------------------------------------------------------ */
    /*  Option A: Validate locked price against current pricing            */
    /* ------------------------------------------------------------------ */
    const { data: pricing } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("event_id", registration.event_id)
      .single<PricingConfig>();

    if (pricing) {
      const recomputed = computePricing(
        {
          dateOfBirth: registration.date_of_birth,
          isFullDuration: registration.is_full_duration,
          isStayingInMotel: registration.is_staying_in_motel ?? undefined,
          numDays: registration.num_days ?? undefined,
        },
        registration.events as unknown as Event,
        pricing
      );

      const storedAmount = Number(registration.computed_amount);
      const currentAmount = recomputed.amount;

      if (Math.abs(storedAmount - currentAmount) > 0.01) {
        return NextResponse.json(
          {
            error: "Pricing has changed since your registration was created. Please re-register to get the updated price.",
            storedAmount,
            currentAmount,
            code: "PRICE_MISMATCH",
          },
          { status: 409 }
        );
      }
    }

    const idempotencyKey = `reg_${registrationId}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Stripe Checkout Session
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
      success_url: `${appUrl}/register/success?session_id={CHECKOUT_SESSION_ID}&registration_id=${registrationId}`,
      cancel_url: `${appUrl}/register/review?registration_id=${registrationId}&cancelled=true`,
      customer_email: registration.email,
      metadata: {
        registration_id: registrationId,
        idempotency_key: idempotencyKey,
      },
    });

    // Upsert payment record (update existing pending or insert new)
    if (existingPayment) {
      await supabase
        .from("payments")
        .update({
          stripe_session_id: session.id,
          amount: registration.computed_amount,
          idempotency_key: idempotencyKey,
        })
        .eq("id", existingPayment.id);
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
  } catch (error) {
    console.error("Payment session error:", error);
    return NextResponse.json(
      { error: "Failed to create payment session" },
      { status: 500 }
    );
  }
}
