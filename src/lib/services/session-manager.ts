import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";
import type { Logger } from "@/lib/logger";
import type Stripe from "stripe";

type SessionLineItem = {
  price_data: {
    currency: string;
    product_data?: { name: string; description: string };
    product?: string;
    unit_amount: number;
  };
  quantity: number;
  metadata?: Record<string, string>;
};

type CreateSessionOpts = {
  supabase: SupabaseClient;
  log: Logger;
  registrationId: string;
  groupId?: string;
  eventId?: string;
  customerEmail: string;
  lineItems: SessionLineItem[];
  amount: number;
  successUrl: string;
  cancelUrl: string;
};

/**
 * Checks for an existing open Stripe checkout session for the given registration.
 * Returns the session URL if one is still open, otherwise null.
 */
export async function reuseExistingSession(
  supabase: SupabaseClient,
  registrationId: string,
  log: Logger
): Promise<{ sessionId: string; url: string } | null> {
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, stripe_session_id, status")
    .eq("registration_id", registrationId)
    .eq("status", "pending")
    .maybeSingle();

  if (!existingPayment?.stripe_session_id) return null;

  const stripe = getStripe();
  try {
    const existingSession = await stripe.checkout.sessions.retrieve(existingPayment.stripe_session_id);
    if (existingSession.status === "open" && existingSession.url) {
      log.info("Reusing existing Stripe session", {
        sessionId: existingSession.id,
        registrationId,
      });
      return { sessionId: existingSession.id, url: existingSession.url };
    }
  } catch {
    log.debug("Existing Stripe session expired or unreachable", {
      stripeSessionId: existingPayment.stripe_session_id,
    });
  }

  return null;
}

/**
 * Creates a Stripe checkout session, persists the payment record, and
 * stamps pending_payment_started_at on the relevant registration(s).
 *
 * If DB persistence fails, the Stripe session is expired as a safety measure.
 */
export async function createAndPersistSession(opts: CreateSessionOpts): Promise<
  | { ok: true; sessionId: string; url: string | null }
  | { ok: false; status: number; error: string }
> {
  const { supabase, log, registrationId, groupId, eventId, customerEmail, lineItems, amount, successUrl, cancelUrl } = opts;

  const idempotencyKey = groupId ? `group_${groupId}` : `reg_${registrationId}`;
  const stripe = getStripe();

  const metadata: Stripe.MetadataParam = {
    registration_id: registrationId,
    idempotency_key: idempotencyKey,
  };
  if (groupId) metadata.group_id = groupId;
  if (eventId) metadata.event_id = eventId;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    metadata,
  });

  log.info("Stripe session created", { stripeSessionId: session.id, amount, idempotencyKey });

  // Persist payment record (upsert pattern)
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("registration_id", registrationId)
    .eq("status", "pending")
    .maybeSingle();

  const dbOp = existingPayment
    ? supabase.from("payments").update({
        stripe_session_id: session.id,
        amount,
        idempotency_key: idempotencyKey,
      }).eq("id", existingPayment.id)
    : supabase.from("payments").insert({
        registration_id: registrationId,
        stripe_session_id: session.id,
        amount,
        currency: "usd",
        status: "pending",
        idempotency_key: idempotencyKey,
      });

  const { error: dbError } = await dbOp;

  if (dbError) {
    log.error("Payment DB write failed — expiring Stripe session", {
      error: dbError.message,
      stripeSessionId: session.id,
    });
    try { await stripe.checkout.sessions.expire(session.id); } catch { /* best effort */ }
    return { ok: false, status: 500, error: "Failed to save payment record" };
  }

  // Stamp pending_payment_started_at
  const now = new Date().toISOString();
  if (groupId) {
    await supabase.from("registrations").update({ pending_payment_started_at: now })
      .eq("group_id", groupId).eq("status", "pending");
  } else {
    await supabase.from("registrations").update({ pending_payment_started_at: now })
      .eq("id", registrationId).eq("status", "pending");
  }

  return { ok: true, sessionId: session.id, url: session.url };
}
