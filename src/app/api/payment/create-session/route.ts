import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import type { Registration } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const { registrationId } = await request.json();

    if (!registrationId) {
      return NextResponse.json(
        { error: "Registration ID required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch registration
    const { data: registration, error } = await supabase
      .from("registrations")
      .select("*, events(name)")
      .eq("id", registrationId)
      .single<Registration & { events: { name: string } }>();

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

    const idempotencyKey = `reg_${registrationId}_${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Stripe Checkout Session
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
            unit_amount: Math.round(registration.computed_amount * 100),
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

    // Create payment record
    await supabase.from("payments").insert({
      registration_id: registrationId,
      stripe_session_id: session.id,
      amount: registration.computed_amount,
      currency: "usd",
      status: "pending",
      idempotency_key: idempotencyKey,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Payment session error:", error);
    return NextResponse.json(
      { error: "Failed to create payment session" },
      { status: 500 }
    );
  }
}
