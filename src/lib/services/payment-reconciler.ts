import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "@/lib/logger";
import type Stripe from "stripe";

export type ReconcileResult =
  | { action: "confirmed"; paymentId: string }
  | { action: "skipped"; reason: string }
  | { action: "failed"; reason: string };

/**
 * Validate and reconcile a completed Stripe checkout session against the DB payment record.
 * Returns the outcome so the caller can decide what to do next.
 */
export async function reconcilePayment(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  log: Logger
): Promise<ReconcileResult> {
  const registrationId = session.metadata?.registration_id;
  const groupId = session.metadata?.group_id;

  if (!registrationId) {
    log.error("No registration_id in session metadata", { sessionId: session.id });
    return { action: "failed", reason: "No registration_id in session metadata" };
  }

  // Look up the payment record
  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, status, amount")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  log.debug("Payment lookup", {
    paymentId: payment?.id,
    status: payment?.status,
    fetchError: fetchError?.message,
  });

  if (!payment) {
    log.error("No payment record for session", { sessionId: session.id });
    await supabase.from("webhook_failures").insert({
      stripe_event_id: stripeEventId,
      event_type: "checkout.session.completed",
      session_id: session.id,
      registration_id: registrationId ?? null,
      group_id: groupId ?? null,
      failure_reason: "No payment record found for Stripe session",
      payload: { session_id: session.id, amount_total: session.amount_total },
    });
    return { action: "failed", reason: "No payment record" };
  }

  if (payment.status === "completed") {
    log.info("Payment already completed — first-write wins", { paymentId: payment.id });
    return { action: "skipped", reason: "already_completed" };
  }

  // Amount validation
  const expectedAmountCents = Math.round(Number(payment.amount) * 100);
  const stripeAmountCents = session.amount_total ?? 0;

  if (stripeAmountCents !== expectedAmountCents) {
    const reason = `Amount mismatch: Stripe charged ${stripeAmountCents} cents, expected ${expectedAmountCents} cents`;
    log.error("Amount mismatch", {
      stripeAmountCents,
      expectedAmountCents,
      storedAmount: payment.amount,
      sessionId: session.id,
    });
    await supabase.from("webhook_failures").insert({
      stripe_event_id: stripeEventId,
      event_type: "checkout.session.completed",
      session_id: session.id,
      registration_id: registrationId ?? null,
      group_id: groupId ?? null,
      failure_reason: reason,
      payload: { session_id: session.id, stripe_amount: stripeAmountCents, expected_amount: expectedAmountCents },
    });
    return { action: "failed", reason };
  }

  // Atomic update: first write wins
  log.info("Updating payment to completed", { paymentId: payment.id, amountCents: stripeAmountCents });

  const { error: paymentError, data: updatedPayment } = await supabase
    .from("payments")
    .update({
      stripe_payment_intent_id: session.payment_intent as string,
      stripe_event_id: stripeEventId,
      status: "completed",
      webhook_received_at: new Date().toISOString(),
    })
    .eq("stripe_session_id", session.id)
    .eq("status", "pending")
    .select("id");

  if (paymentError) {
    log.error("Payment update failed", { error: paymentError.message, paymentId: payment.id });
    return { action: "failed", reason: paymentError.message };
  }

  if (!updatedPayment || updatedPayment.length === 0) {
    log.warn("Payment already updated — concurrent write", { sessionId: session.id });
    return { action: "skipped", reason: "concurrent_write" };
  }

  return { action: "confirmed", paymentId: payment.id };
}

/**
 * Mark a payment as expired when the Stripe checkout session expires.
 */
export async function expirePayment(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  log: Logger
): Promise<void> {
  await supabase
    .from("payments")
    .update({
      stripe_event_id: stripeEventId,
      status: "expired",
      webhook_received_at: new Date().toISOString(),
    })
    .eq("stripe_session_id", session.id)
    .eq("status", "pending");

  log.info("Session expired", { sessionId: session.id, stripeEventId });
}
