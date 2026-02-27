import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/* ------------------------------------------------------------------ */
/*  Supabase admin client — always uses service role key              */
/* ------------------------------------------------------------------ */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* ------------------------------------------------------------------ */
/*  Environment helpers                                               */
/* ------------------------------------------------------------------ */
function isLocalDev(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_INSECURE_WEBHOOKS === "true"
  );
}

/* ------------------------------------------------------------------ */
/*  POST /api/webhooks/stripe                                         */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  /* ---------- Verify event signature ---------- */
  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } else if (isLocalDev()) {
      event = JSON.parse(body) as Stripe.Event;
      console.warn(
        "⚠️  [DEV ONLY] Webhook signature verification skipped — ALLOW_INSECURE_WEBHOOKS is true"
      );
    } else {
      console.error(
        "🚨 STRIPE_WEBHOOK_SECRET is not configured. Webhook rejected. " +
          "Set this variable in production immediately."
      );
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  /* ---------- Idempotency: check stripe event ID ---------- */
  const supabase = getSupabaseAdmin();
  const stripeEventId = event.id; // e.g. evt_1abc...

  const { data: existingEvent } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if (existingEvent) {
    console.log(`↩️  Event ${stripeEventId} already processed — skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  /* ---------- Process event ---------- */
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const registrationId = session.metadata?.registration_id;

        if (!registrationId) {
          console.error("No registration_id in session metadata");
          break;
        }

        // Guard: check the payment row exists and is still pending
        const { data: payment } = await supabase
          .from("payments")
          .select("id, status")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (!payment) {
          console.error(`No payment record for session ${session.id}`);
          break;
        }

        if (payment.status === "completed") {
          console.log(`Payment ${payment.id} already completed — first-write wins`);
          break;
        }

        // Atomic update: first write wins via status check
        const { error: paymentError, count: paymentCount } = await supabase
          .from("payments")
          .update({
            stripe_payment_intent_id: session.payment_intent as string,
            stripe_event_id: stripeEventId,
            status: "completed",
            webhook_received_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending") // Only update if still pending
          .select("id");

        if (paymentError) {
          console.error("Payment update failed:", paymentError.message);
          break;
        }

        if (!paymentCount || paymentCount === 0) {
          console.log(`Payment for session ${session.id} was already updated — skipping`);
          break;
        }

        // Update registration status
        const { error: regError } = await supabase
          .from("registrations")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", registrationId)
          .eq("status", "pending"); // Only update if still pending

        if (regError) {
          console.error("Registration update failed:", regError.message);
        }

        console.log(
          `✅ Registration ${registrationId} confirmed via payment (event: ${stripeEventId})`
        );
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;

        await supabase
          .from("payments")
          .update({
            stripe_event_id: stripeEventId,
            status: "expired",
            webhook_received_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending"); // Only expire if still pending

        console.log(`⏰ Session ${session.id} expired (event: ${stripeEventId})`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
