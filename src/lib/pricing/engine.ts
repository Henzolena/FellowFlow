import type { AgeCategory, ExplanationCode, Event, PricingConfig } from "@/types/database";
import { differenceInYears, parseISO } from "date-fns";

export type PricingInput = {
  dateOfBirth: string;
  isFullDuration: boolean;
  isStayingInMotel?: boolean;
  numDays?: number;
};

export type PricingResult = {
  category: AgeCategory;
  ageAtEvent: number;
  amount: number;
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

  // Full duration path
  if (input.isFullDuration) {
    // Staying in motel → free
    if (input.isStayingInMotel && pricing.motel_stay_free) {
      return {
        category,
        ageAtEvent,
        amount: 0,
        explanationCode: "FULL_MOTEL_FREE",
        explanationDetail: `Full conference attendance with motel stay. Registration is free.`,
      };
    }

    // Not staying in motel → category-based full price
    const priceMap: Record<AgeCategory, { price: number; code: ExplanationCode }> = {
      adult: { price: Number(pricing.adult_full_price), code: "FULL_ADULT" },
      youth: { price: Number(pricing.youth_full_price), code: "FULL_YOUTH" },
      child: { price: Number(pricing.child_full_price), code: "FULL_CHILD" },
    };

    const { price, code } = priceMap[category];
    return {
      category,
      ageAtEvent,
      amount: price,
      explanationCode: code,
      explanationDetail: `Full conference attendance (${category}). Fee: $${price.toFixed(2)}`,
    };
  }

  // Partial duration path → daily rate × number of days
  const numDays = input.numDays ?? 1;
  const dailyMap: Record<AgeCategory, { rate: number; code: ExplanationCode }> = {
    adult: { rate: Number(pricing.adult_daily_price), code: "PARTIAL_ADULT" },
    youth: { rate: Number(pricing.youth_daily_price), code: "PARTIAL_YOUTH" },
    child: { rate: Number(pricing.child_daily_price), code: "PARTIAL_CHILD" },
  };

  const { rate, code } = dailyMap[category];
  const amount = rate * numDays;

  return {
    category,
    ageAtEvent,
    amount,
    explanationCode: code,
    explanationDetail: `Partial attendance: ${numDays} day(s) × $${rate.toFixed(2)}/day (${category}). Total: $${amount.toFixed(2)}`,
  };
}

export function getExplanationLabel(code: ExplanationCode): string {
  const labels: Record<ExplanationCode, string> = {
    FULL_MOTEL_FREE: "Full Conference + Motel (Free)",
    FULL_ADULT: "Full Conference — Adult",
    FULL_YOUTH: "Full Conference — Youth",
    FULL_CHILD: "Full Conference — Child",
    PARTIAL_ADULT: "Partial Attendance — Adult (per day)",
    PARTIAL_YOUTH: "Partial Attendance — Youth (per day)",
    PARTIAL_CHILD: "Partial Attendance — Child (per day)",
  };
  return labels[code] ?? code;
}
