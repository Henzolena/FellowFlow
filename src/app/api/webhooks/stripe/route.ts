import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestLogger } from "@/lib/logger";
import { verifyWebhookEvent } from "@/lib/services/webhook-verifier";
import { reconcilePayment, expirePayment } from "@/lib/services/payment-reconciler";
import { confirmSoloRegistration, confirmGroupRegistrations } from "@/lib/services/registration-confirmer";
import { dispatchSoloConfirmation, dispatchGroupConfirmation } from "@/lib/services/notification-dispatcher";
import { generateEntitlements, generateGroupEntitlements } from "@/lib/services/entitlement-generator";
import Stripe from "stripe";

/* ------------------------------------------------------------------ */
/*  POST /api/webhooks/stripe                                         */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request, "stripe-webhook");
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    log.warn("Missing stripe-signature header");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  /* ---------- 1. Verify event signature ---------- */
  const verification = verifyWebhookEvent(body, signature, log);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }
  const event = verification.event;

  /* ---------- 2. Idempotency: check stripe event ID ---------- */
  const supabase = createAdminClient();
  const stripeEventId = event.id;

  const { data: existingEvent } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if (existingEvent) {
    log.info("Duplicate event — skipping", { stripeEventId });
    return NextResponse.json({ received: true, duplicate: true });
  }

  /* ---------- 3. Process event ---------- */
  try {
    log.info("Processing webhook event", { eventType: event.type, stripeEventId });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const groupId = session.metadata?.group_id;

        // 3a. Reconcile payment (validate + mark completed)
        const result = await reconcilePayment(supabase, session, stripeEventId, log);
        if (result.action !== "confirmed") break;

        // 3b. Confirm registrations + generate entitlements + notify
        const eventId = session.metadata?.event_id;
        if (groupId) {
          await confirmGroupRegistrations(supabase, groupId, log);
          log.info("Group confirmed", { groupId, stripeEventId });
          // 3c. Generate service entitlements (fire-and-forget)
          if (eventId) {
            generateGroupEntitlements(supabase, groupId, eventId, log).catch((e) =>
              log.error("Entitlement generation failed", { groupId, error: String(e) })
            );
          }
          // 3d. Send group notification (fire-and-forget)
          dispatchGroupConfirmation(supabase, groupId, log);
        } else {
          const registrationId = session.metadata?.registration_id;
          if (registrationId) {
            await confirmSoloRegistration(supabase, registrationId, log);
            // 3c. Generate service entitlements (fire-and-forget)
            if (eventId) {
              generateEntitlements(supabase, registrationId, eventId, log).catch((e) =>
                log.error("Entitlement generation failed", { registrationId, error: String(e) })
              );
            }
            // 3d. Send solo notification (fire-and-forget)
            dispatchSoloConfirmation(supabase, registrationId, log);
          }
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await expirePayment(supabase, session, stripeEventId, log);
        break;
      }

      default:
        log.debug("Unhandled event type", { eventType: event.type });
    }
  } catch (error) {
    log.error("Webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
