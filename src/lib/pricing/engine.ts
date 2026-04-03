import type { AgeCategory, AttendanceType, ExplanationCode, Event, PricingConfig, SurchargeTier } from "@/types/database";
import { differenceInYears, parseISO, isWithinInterval } from "date-fns";
import { formatSelectedDays, countChargeableNights } from "@/lib/date-utils";

export type PricingInput = {
  dateOfBirth: string;
  isFullDuration: boolean;
  isStayingInMotel?: boolean;
  numDays?: number;
  selectedDays?: number[];
  attendanceType?: AttendanceType;
  /** Override for surcharge date calculation (defaults to now) */
  registrationDate?: string;
};

export type PricingResult = {
  category: AgeCategory;
  ageAtEvent: number;
  amount: number;
  baseAmount: number;
  surcharge: number;
  surchargeLabel: string | null;
  explanationCode: ExplanationCode;
  explanationDetail: string;
};

export function computeAge(dateOfBirth: string, eventStartDate: string): number {
  return differenceInYears(parseISO(eventStartDate), parseISO(dateOfBirth));
}

export function deriveCategory(
  age: number,
  adultThreshold: number,
  youthThreshold: number
): AgeCategory {
  if (age >= adultThreshold) return "adult";
  if (age >= youthThreshold) return "youth";
  return "child";
}

/**
 * Find the applicable surcharge tier based on registration date.
 */
export function findSurchargeTier(
  tiers: SurchargeTier[],
  registrationDate: Date
): SurchargeTier | null {
  if (!tiers || tiers.length === 0) return null;
  for (const tier of tiers) {
    try {
      const start = parseISO(tier.start_date);
      const end = parseISO(tier.end_date);
      if (isWithinInterval(registrationDate, { start, end })) {
        return tier;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function computePricing(
  input: PricingInput,
  event: Event,
  pricing: PricingConfig
): PricingResult {
  const ageAtEvent = computeAge(input.dateOfBirth, event.start_date);
  const category = deriveCategory(
    ageAtEvent,
    event.adult_age_threshold,
    event.youth_age_threshold
  );

  // ─── Infant path: children at or below infant_age_threshold are FREE ───
  const infantThreshold = event.infant_age_threshold ?? 3;
  if (ageAtEvent <= infantThreshold) {
    return {
      category: "child",
      ageAtEvent,
      amount: 0,
      baseAmount: 0,
      surcharge: 0,
      surchargeLabel: null,
      explanationCode: "FREE_INFANT",
      explanationDetail: `Age ${ageAtEvent} — children ${infantThreshold} and under attend free.`,
    };
  }

  // Derive attendance type: prefer explicit value, fall back to is_full_duration
  const attendanceType: AttendanceType = input.attendanceType
    ?? (input.isFullDuration ? "full_conference" : "partial");

  // ─── KOTE path ───
  // Walk-in / off-campus: flat daily fee regardless of age category
  if (attendanceType === "kote") {
    const numDays = input.numDays ?? 1;
    const koteRate = Number(pricing.kote_daily_price ?? 10);
    const baseAmount = koteRate * numDays;

    const dayLabel = input.selectedDays && input.selectedDays.length > 0
      ? formatSelectedDays(event.start_date, input.selectedDays)
      : `${numDays} day(s)`;
    return applySurcharge(baseAmount, "KOTE", category, ageAtEvent, pricing, input, {
      detail: `KOTE: ${dayLabel} × $${koteRate.toFixed(2)}/day: $${baseAmount.toFixed(2)}`,
    });
  }

  // ─── Full conference path ───
  if (attendanceType === "full_conference") {
    const priceMap: Record<AgeCategory, { price: number; code: ExplanationCode }> = {
      adult: { price: Number(pricing.adult_full_price), code: "FULL_ADULT" },
      youth: { price: Number(pricing.youth_full_price), code: "FULL_YOUTH" },
      child: { price: Number(pricing.child_full_price), code: "FULL_CHILD" },
    };

    const { price, code } = priceMap[category];
    return applySurcharge(price, code, category, ageAtEvent, pricing, input, {
      detail: `Full conference (${category}): $${price.toFixed(2)}`,
    });
  }

  // ─── Partial attendance path ───
  // Nightly dorm rate × number of chargeable nights (Sundays excluded)
  const numDays = input.numDays ?? 1;
  const chargeableNights = countChargeableNights(event.start_date, input.selectedDays, numDays);
  const dailyMap: Record<AgeCategory, { rate: number; code: ExplanationCode }> = {
    adult: { rate: Number(pricing.adult_daily_price), code: "PARTIAL_ADULT" },
    youth: { rate: Number(pricing.youth_daily_price), code: "PARTIAL_YOUTH" },
    child: { rate: Number(pricing.child_daily_price), code: "PARTIAL_CHILD" },
  };

  const { rate, code } = dailyMap[category];
  const baseAmount = rate * chargeableNights;

  const dayLabel = input.selectedDays && input.selectedDays.length > 0
    ? formatSelectedDays(event.start_date, input.selectedDays)
    : `${numDays} day(s)`;
  const nightNote = chargeableNights < numDays ? ` (${chargeableNights} chargeable night(s), Sunday excluded)` : "";
  return applySurcharge(baseAmount, code, category, ageAtEvent, pricing, input, {
    detail: `${dayLabel} × $${rate.toFixed(2)}/night (${category})${nightNote}: $${baseAmount.toFixed(2)}`,
  });
}

/**
 * Apply late-registration surcharge if applicable, then return final PricingResult.
 */
function applySurcharge(
  baseAmount: number,
  code: ExplanationCode,
  category: AgeCategory,
  ageAtEvent: number,
  pricing: PricingConfig,
  input: PricingInput,
  opts: { detail: string }
): PricingResult {
  const regDate = input.registrationDate ? parseISO(input.registrationDate) : new Date();
  const tier = findSurchargeTier(pricing.late_surcharge_tiers ?? [], regDate);

  const surcharge = tier ? Number(tier.amount) : 0;
  const total = baseAmount + surcharge;

  let explanationDetail = opts.detail;
  if (surcharge > 0 && tier) {
    explanationDetail += ` + $${surcharge.toFixed(2)} ${tier.label}`;
  }
  explanationDetail += `. Total: $${total.toFixed(2)}`;

  return {
    category,
    ageAtEvent,
    amount: total,
    baseAmount,
    surcharge,
    surchargeLabel: tier?.label ?? null,
    explanationCode: code,
    explanationDetail,
  };
}

/* ------------------------------------------------------------------ */
/*  Group pricing: surcharge applied ONCE on the combined total        */
/* ------------------------------------------------------------------ */

export type GroupPricingInput = {
  registrants: PricingInput[];
};

export type GroupPricingResult = {
  items: PricingResult[];
  subtotal: number;
  surcharge: number;
  surchargeLabel: string | null;
  grandTotal: number;
};

/**
 * Compute pricing for a group of registrants.
 * Each person is priced individually (base only, no surcharge).
 * Surcharge is applied ONCE on the combined subtotal.
 */
export function computeGroupPricing(
  inputs: PricingInput[],
  event: Event,
  pricing: PricingConfig
): GroupPricingResult {
  // Compute base pricing for each registrant (no surcharge)
  const items: PricingResult[] = inputs.map((input) => {
    const result = computePricing(input, event, pricing);
    // Strip out individual surcharge — it will be applied on the group total
    return {
      ...result,
      amount: result.baseAmount, // Use base only
      surcharge: 0,
      surchargeLabel: null,
      explanationDetail: result.explanationDetail
        .replace(/ \+ \$[\d.]+ .+?(?=\. Total)/, "") // Remove surcharge text
        .replace(/\. Total: \$[\d.]+$/, ""), // Remove old total
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

  // Determine surcharge once based on registration date
  const regDate = inputs[0]?.registrationDate
    ? parseISO(inputs[0].registrationDate)
    : new Date();
  const tier = findSurchargeTier(pricing.late_surcharge_tiers ?? [], regDate);
  const surcharge = subtotal > 0 && tier ? Number(tier.amount) : 0;
  const grandTotal = subtotal + surcharge;

  return {
    items,
    subtotal,
    surcharge,
    surchargeLabel: tier?.label ?? null,
    grandTotal,
  };
}

/**
 * Compute meal price per person based on age and pricing config.
 *
 * Age brackets (same for ALL attendance types including KOTE):
 * - Under meal_free_age_threshold (default 2): FREE ($0)
 * - meal_free_age_threshold to meal_child_max_age (default 2–10): child price ($8)
 * - 11+ (youth and adult): adult price ($12)
 */
export function computeMealPrice(
  ageAtEvent: number,
  _attendanceType: AttendanceType,
  pricing: PricingConfig
): number {
  const freeThreshold = pricing.meal_free_age_threshold ?? 2;
  if (ageAtEvent < freeThreshold) {
    return 0;
  }

  const childMaxAge = pricing.meal_child_max_age ?? 10;
  if (ageAtEvent <= childMaxAge) {
    return Number(pricing.meal_price_child);
  }

  // Youth (11–17) and Adult (18+) both pay adult price
  return Number(pricing.meal_price_adult);
}

export function getExplanationLabel(code: ExplanationCode | string): string {
  const labels: Record<string, string> = {
    FREE_INFANT: "Infant / Toddler (Free)",
    FULL_ADULT: "Full Conference — Adult",
    FULL_YOUTH: "Full Conference — Youth",
    FULL_CHILD: "Full Conference — Child",
    PARTIAL_ADULT: "Partial Attendance — Adult (per day)",
    PARTIAL_YOUTH: "Partial Attendance — Youth (per day)",
    PARTIAL_CHILD: "Partial Attendance — Child (per day)",
    KOTE: "KOTE — Walk-in / Off-Campus (per day)",
    // Legacy code — kept for backward compatibility with existing records
    FULL_MOTEL_FREE: "Full Conference + Motel (Free)",
  };
  return labels[code] ?? code;
}
