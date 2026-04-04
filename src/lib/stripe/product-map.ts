import type { ExplanationCode } from "@/types/database";

/**
 * Maps FellowFlow pricing / service catalog entities to Stripe product IDs.
 *
 * Product ID conventions:
 *   Registration: ff-pc-{pricing_config_id_no_dashes}-{band}
 *   Meals:        ff-sc-{service_catalog_id_no_dashes}
 *   Surcharges:   env-configured (Stripe auto-generated IDs)
 */

// ── ExplanationCode → Stripe product band suffix ──

const CODE_TO_BAND: Record<string, string> = {
  FULL_ADULT: "adult-full",
  FULL_YOUTH: "youth-full",
  FULL_CHILD: "child-full",
  PARTIAL_ADULT: "adult-daily",
  PARTIAL_YOUTH: "youth-daily",
  PARTIAL_CHILD: "child-daily",
  KOTE: "kote-daily",
};

function stripDashes(uuid: string): string {
  return uuid.replace(/-/g, "");
}

/**
 * Derive the Stripe product ID for a registration line item.
 * Returns null for FREE_INFANT (no payment).
 */
export function registrationProductId(
  pricingConfigId: string,
  explanationCode: ExplanationCode | string
): string | null {
  const band = CODE_TO_BAND[explanationCode];
  if (!band) return null; // FREE_INFANT or unknown
  return `ff-pc-${stripDashes(pricingConfigId)}-${band}`;
}

/**
 * Derive the Stripe product ID for a service_catalog meal.
 */
export function mealProductId(serviceCatalogId: string): string {
  return `ff-sc-${stripDashes(serviceCatalogId)}`;
}

/**
 * Get the Stripe product ID for a late-registration surcharge.
 * Reads from env because Stripe auto-generates the product ID.
 *
 * Env vars:
 *   STRIPE_PRODUCT_LATE_FEE      – "Late Registration Fee" product
 *   STRIPE_PRODUCT_ONSITE_FEE    – "On-Site Registration Fee" product
 */
export function surchargeProductId(surchargeLabel: string | null): string | null {
  if (!surchargeLabel) return null;

  const normalized = surchargeLabel.toLowerCase();
  if (normalized.includes("on-site") || normalized.includes("onsite")) {
    return process.env.STRIPE_PRODUCT_ONSITE_FEE ?? null;
  }
  if (normalized.includes("late")) {
    return process.env.STRIPE_PRODUCT_LATE_FEE ?? null;
  }
  return null;
}
