import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(url, serviceKey || anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret) {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
      console.warn("⚠️ Webhook signature verification skipped (no secret configured)");
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const registrationId = session.metadata?.registration_id;
        const idempotencyKey = session.metadata?.idempotency_key;

        if (!registrationId) {
          console.error("No registration_id in session metadata");
          break;
        }

        // Idempotency check
        if (idempotencyKey) {
          const { data: existingPayment } = await supabase
            .from("payments")
            .select("id, status")
            .eq("idempotency_key", idempotencyKey)
            .eq("status", "completed")
            .single();

          if (existingPayment) {
            console.log(`Payment already processed for key: ${idempotencyKey}`);
            break;
          }
        }

        // Update payment record
        const { error: paymentError } = await supabase
          .from("payments")
          .update({
            stripe_payment_intent_id: session.payment_intent as string,
            status: "completed",
            webhook_received_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id);

        if (paymentError) {
          console.error("Payment update failed:", paymentError.message);
        }

        // Update registration status
        const { error: regError } = await supabase
          .from("registrations")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", registrationId);

        if (regError) {
          console.error("Registration update failed:", regError.message);
        }

        console.log(`✅ Registration ${registrationId} confirmed via payment`);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await supabase
          .from("payments")
          .update({
            status: "expired",
            webhook_received_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id);
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
