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

        // ── Meal purchase flow ──
        if (session.metadata?.type === "meal_purchase") {
          await handleMealPurchaseCompleted(supabase, session, log);
          break;
        }

        const groupId = session.metadata?.group_id;

        // 3a. Reconcile payment (validate + mark completed)
        const result = await reconcilePayment(supabase, session, stripeEventId, log);
        if (result.action !== "confirmed") break;

        // 3b. Confirm registrations + generate entitlements + notify
        const eventId = session.metadata?.event_id;
        if (groupId) {
          await confirmGroupRegistrations(supabase, groupId, log);
          log.info("Group confirmed", { groupId, stripeEventId });
          // 3c. Generate service entitlements
          if (eventId) {
            try {
              await generateGroupEntitlements(supabase, groupId, eventId, log);
            } catch (e) {
              log.error("Entitlement generation failed", { groupId, error: String(e) });
            }
          }
          // 3d. Send group notification
          await dispatchGroupConfirmation(supabase, groupId, log);
        } else {
          const registrationId = session.metadata?.registration_id;
          if (registrationId) {
            await confirmSoloRegistration(supabase, registrationId, log);
            // 3c. Generate service entitlements
            if (eventId) {
              try {
                await generateEntitlements(supabase, registrationId, eventId, log);
              } catch (e) {
                log.error("Entitlement generation failed", { registrationId, error: String(e) });
              }
            }
            // 3d. Send solo notification
            await dispatchSoloConfirmation(supabase, registrationId, log);
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

/* ------------------------------------------------------------------ */
/*  Meal purchase completion handler                                    */
/* ------------------------------------------------------------------ */
async function handleMealPurchaseCompleted(
  supabase: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
  log: ReturnType<typeof createRequestLogger>
) {
  const purchaseId = session.metadata?.meal_purchase_id;
  const registrationId = session.metadata?.registration_id;

  if (!purchaseId || !registrationId) {
    log.warn("Meal purchase webhook missing metadata", { metadata: session.metadata });
    return;
  }

  // Mark the purchase as completed
  const { error: updateError } = await supabase
    .from("meal_purchases")
    .update({ payment_status: "completed", stripe_session_id: session.id })
    .eq("id", purchaseId)
    .eq("payment_status", "pending");

  if (updateError) {
    log.error("Failed to update meal purchase status", { purchaseId, error: updateError.message });
    return;
  }

  // Fetch the purchase items to create entitlements
  const { data: items } = await supabase
    .from("meal_purchase_items")
    .select("service_id, unit_price")
    .eq("meal_purchase_id", purchaseId);

  if (!items || items.length === 0) {
    log.warn("Meal purchase has no items", { purchaseId });
    return;
  }

  // Create service entitlements for each purchased meal
  const entitlements = items.map((item) => ({
    registration_id: registrationId,
    service_id: item.service_id,
    status: "paid_extra" as const,
    quantity_allowed: 1,
    quantity_used: 0,
    notes: `Stripe meal purchase #${purchaseId.slice(0, 8)}`,
  }));

  const { error: entError } = await supabase
    .from("service_entitlements")
    .upsert(entitlements, { onConflict: "registration_id,service_id" });

  if (entError) {
    log.error("Failed to create meal entitlements", { purchaseId, error: entError.message });
  } else {
    log.info("Meal purchase completed — entitlements created", {
      purchaseId,
      registrationId,
      mealsCount: items.length,
    });
  }

  // Update selected_meal_ids on the registration to include newly purchased meals
  const { data: reg } = await supabase
    .from("registrations")
    .select("selected_meal_ids, group_id")
    .eq("id", registrationId)
    .single();

  if (reg) {
    const existingIds: string[] = (reg.selected_meal_ids as string[] | null) || [];
    const newIds = items.map((i) => i.service_id);
    const mergedIds = [...new Set([...existingIds, ...newIds])];

    await supabase
      .from("registrations")
      .update({ selected_meal_ids: mergedIds })
      .eq("id", registrationId);

    // Send updated receipt email with regenerated badge
    try {
      const groupId = reg.group_id as string | null;
      if (groupId) {
        await dispatchGroupConfirmation(supabase, groupId, log);
      } else {
        await dispatchSoloConfirmation(supabase, registrationId, log);
      }
      log.info("Updated receipt email sent after meal purchase", { registrationId, purchaseId });
    } catch (emailErr) {
      log.error("Failed to send updated receipt after meal purchase", {
        registrationId,
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }
  }
}
