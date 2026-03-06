import { getStripe } from "@/lib/stripe/client";
import type { Logger } from "@/lib/logger";
import Stripe from "stripe";

function isLocalDev(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_INSECURE_WEBHOOKS === "true"
  );
}

export type VerifyResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; status: number; error: string };

/**
 * Verify and parse a Stripe webhook event from the raw request body + signature.
 */
export function verifyWebhookEvent(
  body: string,
  signature: string,
  log: Logger
): VerifyResult {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (webhookSecret) {
    try {
      const event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
      return { ok: true, event };
    } catch (err) {
      log.error("Signature verification failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, status: 400, error: "Invalid signature" };
    }
  }

  if (isLocalDev()) {
    log.warn("Signature verification skipped — ALLOW_INSECURE_WEBHOOKS is true (dev only)");
    return { ok: true, event: JSON.parse(body) as Stripe.Event };
  }

  log.error("STRIPE_WEBHOOK_SECRET not configured — webhook rejected");
  return { ok: false, status: 500, error: "Webhook secret not configured" };
}
