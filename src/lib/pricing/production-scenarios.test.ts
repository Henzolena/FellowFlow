/**
 * Production-realistic pricing tests for Midwest Conference 2026.
 *
 * These tests use ACTUAL production configuration values from the database
 * to validate every pricing path before go-live.
 *
 * Event: Jul 30 (Thu) – Aug 2 (Sun), 4 days
 * Age thresholds: infant ≤ 1, youth ≥ 11, adult ≥ 18
 * Late fees: Jul 1–29 = $25, Jul 30–Aug 2 = $50 (on-site)
 */
import { describe, it, expect } from "vitest";
import {
  computeAge,
  deriveCategory,
  findSurchargeTier,
  computePricing,
  computeGroupPricing,
  computeMealPrice,
} from "./engine";
import type { Event, PricingConfig, SurchargeTier } from "@/types/database";
import { parseISO } from "date-fns";

// ─── Production fixtures ───────────────────────────────────────

function prodEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "prod-evt",
    name: "Midwest Conference 2026",
    description: null,
    start_date: "2026-07-30",  // Thursday
    end_date: "2026-08-02",    // Sunday
    duration_days: 4,
    adult_age_threshold: 18,
    youth_age_threshold: 11,
    infant_age_threshold: 1,
    is_active: true,
    wristband_config: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const PROD_LATE_TIERS: SurchargeTier[] = [
  { start_date: "2026-07-01", end_date: "2026-07-29", amount: 25, label: "Late Registration Fee" },
  { start_date: "2026-07-30", end_date: "2026-08-02", amount: 50, label: "On-Site Registration Fee" },
];

function prodPricing(overrides: Partial<PricingConfig> = {}): PricingConfig {
  return {
    id: "prod-pc",
    event_id: "prod-evt",
    adult_full_price: 150,
    adult_daily_price: 38,
    youth_full_price: 100,
    youth_daily_price: 38,
    child_full_price: 50,
    child_daily_price: 38,
    kote_daily_price: 10,
    lodging_fee: 0,
    meal_price_adult: 12,
    meal_price_youth: 12,
    meal_price_child: 8,
    meal_price_kote: 10,
    meal_free_age_threshold: 2,
    meal_child_max_age: 10,
    late_surcharge_tiers: PROD_LATE_TIERS,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// Helpers for DOB → age at event (Jul 30 2026)
const DOB = {
  infant0: "2026-03-01",     // age 0 at event
  infant1: "2025-07-30",     // age 1 at event (exactly)
  child2: "2024-07-30",      // age 2 (exactly at meal free threshold)
  child5: "2021-01-15",      // age 5
  child10: "2016-07-30",     // age 10 (exactly at youth boundary - 1)
  youth11: "2015-07-30",     // age 11 (exactly at youth threshold)
  youth14: "2012-01-15",     // age 14
  youth17: "2009-07-30",     // age 17
  almostAdult: "2008-08-15", // still 17 at event (birthday after event start)
  adult18: "2008-07-30",     // age 18 (exactly at adult threshold)
  adult25: "2001-01-01",     // age 25
  adult40: "1986-01-01",     // age 40
  adult65: "1961-01-01",     // age 65
};

// ════════════════════════════════════════════════════════════════
// 1. AGE COMPUTATION WITH PRODUCTION THRESHOLDS
// ════════════════════════════════════════════════════════════════

describe("production — age computation", () => {
  const event = prodEvent();

  it("computes age 0 for infant born in 2026", () => {
    expect(computeAge(DOB.infant0, event.start_date)).toBe(0);
  });

  it("computes age 1 for infant born exactly 1 year before event", () => {
    expect(computeAge(DOB.infant1, event.start_date)).toBe(1);
  });

  it("computes age 17 when birthday is AFTER event start", () => {
    // Born Aug 15 2008, event Jul 30 2026 → hasn't turned 18 yet
    expect(computeAge(DOB.almostAdult, event.start_date)).toBe(17);
  });

  it("computes age 18 when birthday is ON event start", () => {
    expect(computeAge(DOB.adult18, event.start_date)).toBe(18);
  });

  it("computes age 11 exactly at youth threshold", () => {
    expect(computeAge(DOB.youth11, event.start_date)).toBe(11);
  });
});

describe("production — category derivation", () => {
  const event = prodEvent();
  const { adult_age_threshold: at, youth_age_threshold: yt } = event;

  it("infant (age ≤ 1) → child category", () => {
    expect(deriveCategory(0, at, yt)).toBe("child");
    expect(deriveCategory(1, at, yt)).toBe("child");
  });

  it("child (age 2–10) → child category", () => {
    expect(deriveCategory(2, at, yt)).toBe("child");
    expect(deriveCategory(10, at, yt)).toBe("child");
  });

  it("youth (age 11–17) → youth category", () => {
    expect(deriveCategory(11, at, yt)).toBe("youth");
    expect(deriveCategory(17, at, yt)).toBe("youth");
  });

  it("adult (age 18+) → adult category", () => {
    expect(deriveCategory(18, at, yt)).toBe("adult");
    expect(deriveCategory(65, at, yt)).toBe("adult");
  });
});

// ════════════════════════════════════════════════════════════════
// 2. LATE FEE / SURCHARGE TIERS
// ════════════════════════════════════════════════════════════════

describe("production — late registration surcharge tiers", () => {
  it("no surcharge for early registration (before Jul 1)", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-03-15"))).toBeNull();
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-06-30"))).toBeNull();
  });

  it("$25 late fee for Jul 1 (first day of tier 1)", () => {
    const tier = findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-07-01"));
    expect(tier).not.toBeNull();
    expect(tier!.amount).toBe(25);
    expect(tier!.label).toBe("Late Registration Fee");
  });

  it("$25 late fee for Jul 15 (mid tier 1)", () => {
    const tier = findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-07-15"));
    expect(tier!.amount).toBe(25);
  });

  it("$25 late fee for Jul 29 (last day of tier 1)", () => {
    const tier = findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-07-29"));
    expect(tier!.amount).toBe(25);
    expect(tier!.label).toBe("Late Registration Fee");
  });

  it("$50 on-site fee for Jul 30 (event day 1)", () => {
    const tier = findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-07-30"));
    expect(tier!.amount).toBe(50);
    expect(tier!.label).toBe("On-Site Registration Fee");
  });

  it("$50 on-site fee for Aug 2 (last day of event)", () => {
    const tier = findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-08-02"));
    expect(tier!.amount).toBe(50);
    expect(tier!.label).toBe("On-Site Registration Fee");
  });

  it("no surcharge after event ends (Aug 3+)", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-08-03"))).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════
// 3. SOLO REGISTRATION — FULL CONFERENCE
// ════════════════════════════════════════════════════════════════

describe("production — solo full conference pricing", () => {
  const event = prodEvent();
  const pricing = prodPricing();

  it("infant (age 0) → FREE", () => {
    const r = computePricing({ dateOfBirth: DOB.infant0, isFullDuration: true }, event, pricing);
    expect(r.amount).toBe(0);
    expect(r.explanationCode).toBe("FREE_INFANT");
    expect(r.category).toBe("child");
  });

  it("infant (age 1, exactly at threshold) → FREE", () => {
    const r = computePricing({ dateOfBirth: DOB.infant1, isFullDuration: true }, event, pricing);
    expect(r.amount).toBe(0);
    expect(r.explanationCode).toBe("FREE_INFANT");
  });

  it("child (age 5) → $50", () => {
    const r = computePricing(
      { dateOfBirth: DOB.child5, isFullDuration: true, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(50);
    expect(r.explanationCode).toBe("FULL_CHILD");
    expect(r.category).toBe("child");
  });

  it("youth (age 14) → $100", () => {
    const r = computePricing(
      { dateOfBirth: DOB.youth14, isFullDuration: true, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(100);
    expect(r.explanationCode).toBe("FULL_YOUTH");
    expect(r.category).toBe("youth");
  });

  it("adult (age 40) → $150", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(150);
    expect(r.explanationCode).toBe("FULL_ADULT");
    expect(r.category).toBe("adult");
  });

  it("age 17 (almost 18, birthday after event) → YOUTH $100", () => {
    const r = computePricing(
      { dateOfBirth: DOB.almostAdult, isFullDuration: true, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(100);
    expect(r.category).toBe("youth");
    expect(r.explanationCode).toBe("FULL_YOUTH");
  });

  it("age 18 exactly → ADULT $150", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult18, isFullDuration: true, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(150);
    expect(r.category).toBe("adult");
    expect(r.explanationCode).toBe("FULL_ADULT");
  });
});

// ════════════════════════════════════════════════════════════════
// 4. SOLO REGISTRATION — FULL CONFERENCE + LATE FEES
// ════════════════════════════════════════════════════════════════

describe("production — solo full conference + late fees", () => {
  const event = prodEvent();
  const pricing = prodPricing();

  it("adult early bird (Mar 1) → $150, no surcharge", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(150);
    expect(r.surcharge).toBe(0);
    expect(r.amount).toBe(150);
    expect(r.surchargeLabel).toBeNull();
  });

  it("adult late registration (Jul 15) → $150 + $25 = $175", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-07-15" },
      event, pricing
    );
    expect(r.baseAmount).toBe(150);
    expect(r.surcharge).toBe(25);
    expect(r.amount).toBe(175);
    expect(r.surchargeLabel).toBe("Late Registration Fee");
  });

  it("adult on-site registration (Jul 30) → $150 + $50 = $200", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-07-30" },
      event, pricing
    );
    expect(r.baseAmount).toBe(150);
    expect(r.surcharge).toBe(50);
    expect(r.amount).toBe(200);
    expect(r.surchargeLabel).toBe("On-Site Registration Fee");
  });

  it("youth late registration (Jul 10) → $100 + $25 = $125", () => {
    const r = computePricing(
      { dateOfBirth: DOB.youth14, isFullDuration: true, registrationDate: "2026-07-10" },
      event, pricing
    );
    expect(r.baseAmount).toBe(100);
    expect(r.surcharge).toBe(25);
    expect(r.amount).toBe(125);
  });

  it("youth on-site registration (Aug 1) → $100 + $50 = $150", () => {
    const r = computePricing(
      { dateOfBirth: DOB.youth14, isFullDuration: true, registrationDate: "2026-08-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(100);
    expect(r.surcharge).toBe(50);
    expect(r.amount).toBe(150);
  });

  it("child late registration (Jul 20) → $50 + $25 = $75", () => {
    const r = computePricing(
      { dateOfBirth: DOB.child5, isFullDuration: true, registrationDate: "2026-07-20" },
      event, pricing
    );
    expect(r.baseAmount).toBe(50);
    expect(r.surcharge).toBe(25);
    expect(r.amount).toBe(75);
  });

  it("infant NEVER gets surcharge even if registered on-site", () => {
    const r = computePricing(
      { dateOfBirth: DOB.infant0, isFullDuration: true, registrationDate: "2026-07-30" },
      event, pricing
    );
    expect(r.amount).toBe(0);
    expect(r.surcharge).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. PARTIAL ATTENDANCE — DAILY RATE + SUNDAY EXCLUSION
// ════════════════════════════════════════════════════════════════

describe("production — partial attendance with Sunday exclusion", () => {
  const event = prodEvent();
  const pricing = prodPricing();
  // Day 1 = Thu Jul 30, Day 2 = Fri Jul 31, Day 3 = Sat Aug 1, Day 4 = Sun Aug 2

  it("all 4 days selected → 3 chargeable nights (Sun excluded) × $38 = $114", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 4, selectedDays: [1, 2, 3, 4], registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(114);
    expect(r.explanationCode).toBe("PARTIAL_ADULT");
  });

  it("Thu + Fri only → 2 chargeable nights × $38 = $76", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 2, selectedDays: [1, 2], registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(76);
  });

  it("Fri + Sat + Sun → 2 chargeable nights × $38 = $76", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 3, selectedDays: [2, 3, 4], registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(76);
  });

  it("Sunday only → $0", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 1, selectedDays: [4], registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(0);
  });

  it("youth partial 2 days (non-Sunday) → 2 × $38 = $76", () => {
    const r = computePricing(
      { dateOfBirth: DOB.youth14, isFullDuration: false, numDays: 2, selectedDays: [1, 3], registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(76);
    expect(r.explanationCode).toBe("PARTIAL_YOUTH");
  });

  it("child partial 1 day → 1 × $38 = $38", () => {
    const r = computePricing(
      { dateOfBirth: DOB.child5, isFullDuration: false, numDays: 1, selectedDays: [1], registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(38);
    expect(r.explanationCode).toBe("PARTIAL_CHILD");
  });

  it("infant partial → still FREE", () => {
    const r = computePricing(
      { dateOfBirth: DOB.infant0, isFullDuration: false, numDays: 3, selectedDays: [1, 2, 3] },
      event, pricing
    );
    expect(r.amount).toBe(0);
    expect(r.explanationCode).toBe("FREE_INFANT");
  });

  it("partial + late fee → $76 + $25 = $101", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 2, selectedDays: [1, 2], registrationDate: "2026-07-15" },
      event, pricing
    );
    expect(r.baseAmount).toBe(76);
    expect(r.surcharge).toBe(25);
    expect(r.amount).toBe(101);
  });

  it("partial + on-site fee → $114 + $50 = $164", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 4, selectedDays: [1, 2, 3, 4], registrationDate: "2026-07-31" },
      event, pricing
    );
    expect(r.baseAmount).toBe(114);
    expect(r.surcharge).toBe(50);
    expect(r.amount).toBe(164);
  });
});

// ════════════════════════════════════════════════════════════════
// 6. KOTE (WALK-IN / DAY CAMPER)
// ════════════════════════════════════════════════════════════════

describe("production — KOTE pricing", () => {
  const event = prodEvent();
  const pricing = prodPricing();

  it("adult KOTE 2 days → 2 × $10 = $20", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(20);
    expect(r.explanationCode).toBe("KOTE");
  });

  it("youth KOTE 3 days → 3 × $10 = $30", () => {
    const r = computePricing(
      { dateOfBirth: DOB.youth14, isFullDuration: false, numDays: 3, attendanceType: "kote", registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(30);
    expect(r.explanationCode).toBe("KOTE");
  });

  it("child KOTE 1 day → 1 × $10 = $10", () => {
    const r = computePricing(
      { dateOfBirth: DOB.child5, isFullDuration: false, numDays: 1, attendanceType: "kote", registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(10);
    expect(r.explanationCode).toBe("KOTE");
  });

  it("infant KOTE → FREE (overrides KOTE daily rate)", () => {
    const r = computePricing(
      { dateOfBirth: DOB.infant0, isFullDuration: false, numDays: 2, attendanceType: "kote" },
      event, pricing
    );
    expect(r.amount).toBe(0);
    expect(r.explanationCode).toBe("FREE_INFANT");
  });

  it("KOTE + late fee → $20 + $25 = $45", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-07-15" },
      event, pricing
    );
    expect(r.baseAmount).toBe(20);
    expect(r.surcharge).toBe(25);
    expect(r.amount).toBe(45);
  });

  it("KOTE + on-site fee → $20 + $50 = $70", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-07-30" },
      event, pricing
    );
    expect(r.baseAmount).toBe(20);
    expect(r.surcharge).toBe(50);
    expect(r.amount).toBe(70);
  });

  it("KOTE with selectedDays label", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 2, selectedDays: [2, 3], attendanceType: "kote", registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(20);
    expect(r.explanationDetail).toContain("$10.00/day");
  });
});

// ════════════════════════════════════════════════════════════════
// 7. MEAL PRICING — PRODUCTION VALUES
// ════════════════════════════════════════════════════════════════

describe("production — meal pricing", () => {
  const pricing = prodPricing();

  it("infant (age 0) → FREE meal", () => {
    expect(computeMealPrice(0, "full_conference", pricing)).toBe(0);
  });

  it("infant (age 1) → FREE meal", () => {
    expect(computeMealPrice(1, "full_conference", pricing)).toBe(0);
  });

  it("child (age 2, at free threshold) → $8", () => {
    expect(computeMealPrice(2, "full_conference", pricing)).toBe(8);
  });

  it("child (age 5) → $8", () => {
    expect(computeMealPrice(5, "full_conference", pricing)).toBe(8);
  });

  it("child (age 10, at child max) → $8", () => {
    expect(computeMealPrice(10, "full_conference", pricing)).toBe(8);
  });

  it("youth (age 11) → $12", () => {
    expect(computeMealPrice(11, "full_conference", pricing)).toBe(12);
  });

  it("youth (age 17) → $12", () => {
    expect(computeMealPrice(17, "partial", pricing)).toBe(12);
  });

  it("adult (age 18) → $12", () => {
    expect(computeMealPrice(18, "full_conference", pricing)).toBe(12);
  });

  it("adult (age 65) → $12", () => {
    expect(computeMealPrice(65, "full_conference", pricing)).toBe(12);
  });

  it("KOTE infant → FREE", () => {
    expect(computeMealPrice(0, "kote", pricing)).toBe(0);
    expect(computeMealPrice(1, "kote", pricing)).toBe(0);
  });

  it("KOTE child → $8 (same as non-KOTE)", () => {
    expect(computeMealPrice(5, "kote", pricing)).toBe(8);
    expect(computeMealPrice(10, "kote", pricing)).toBe(8);
  });

  it("KOTE youth → $12 (same as non-KOTE)", () => {
    expect(computeMealPrice(11, "kote", pricing)).toBe(12);
    expect(computeMealPrice(17, "kote", pricing)).toBe(12);
  });

  it("KOTE adult → $12 (same as non-KOTE)", () => {
    expect(computeMealPrice(18, "kote", pricing)).toBe(12);
    expect(computeMealPrice(40, "kote", pricing)).toBe(12);
  });
});

// ════════════════════════════════════════════════════════════════
// 8. GROUP REGISTRATION — COMBINED SCENARIOS
// ════════════════════════════════════════════════════════════════

describe("production — group registration pricing", () => {
  const event = prodEvent();
  const pricing = prodPricing();

  it("family of 4: 2 adults + 1 youth + 1 infant (early bird)", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-03-01" },
      { dateOfBirth: DOB.adult25, isFullDuration: true, registrationDate: "2026-03-01" },
      { dateOfBirth: DOB.youth14, isFullDuration: true, registrationDate: "2026-03-01" },
      { dateOfBirth: DOB.infant0, isFullDuration: true, registrationDate: "2026-03-01" },
    ], event, pricing);

    expect(r.items[0].amount).toBe(150);  // adult
    expect(r.items[1].amount).toBe(150);  // adult
    expect(r.items[2].amount).toBe(100);  // youth
    expect(r.items[3].amount).toBe(0);    // infant FREE
    expect(r.subtotal).toBe(400);
    expect(r.surcharge).toBe(0);
    expect(r.grandTotal).toBe(400);
  });

  it("family of 4 with late fee → surcharge applied ONCE", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-07-15" },
      { dateOfBirth: DOB.adult25, isFullDuration: true, registrationDate: "2026-07-15" },
      { dateOfBirth: DOB.youth14, isFullDuration: true, registrationDate: "2026-07-15" },
      { dateOfBirth: DOB.infant0, isFullDuration: true, registrationDate: "2026-07-15" },
    ], event, pricing);

    expect(r.subtotal).toBe(400);
    expect(r.surcharge).toBe(25);
    expect(r.surchargeLabel).toBe("Late Registration Fee");
    expect(r.grandTotal).toBe(425);

    // Individual items should NOT have surcharge
    for (const item of r.items) {
      expect(item.surcharge).toBe(0);
      expect(item.surchargeLabel).toBeNull();
    }
  });

  it("family of 4 with on-site fee → $50 surcharge once", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: DOB.adult25, isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: DOB.youth14, isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: DOB.infant0, isFullDuration: true, registrationDate: "2026-07-30" },
    ], event, pricing);

    expect(r.subtotal).toBe(400);
    expect(r.surcharge).toBe(50);
    expect(r.surchargeLabel).toBe("On-Site Registration Fee");
    expect(r.grandTotal).toBe(450);
  });

  it("group of only infants → no surcharge even if late", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.infant0, isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: DOB.infant1, isFullDuration: true, registrationDate: "2026-07-30" },
    ], event, pricing);

    expect(r.subtotal).toBe(0);
    expect(r.surcharge).toBe(0);
    expect(r.grandTotal).toBe(0);
  });

  it("mixed: full + partial + KOTE in one group (early bird)", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-03-01" },                          // adult full: $150
      { dateOfBirth: DOB.youth14, isFullDuration: false, numDays: 2, selectedDays: [1, 2], registrationDate: "2026-03-01" },  // youth partial: 2×$38=$76
      { dateOfBirth: DOB.adult25, isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-03-01" }, // KOTE: 2×$10=$20
    ], event, pricing);

    expect(r.items[0].amount).toBe(150);
    expect(r.items[1].amount).toBe(76);
    expect(r.items[2].amount).toBe(20);
    expect(r.subtotal).toBe(246);
    expect(r.surcharge).toBe(0);
    expect(r.grandTotal).toBe(246);
  });

  it("mixed group + late fee → surcharge once on combined total", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-07-20" },
      { dateOfBirth: DOB.youth14, isFullDuration: false, numDays: 2, selectedDays: [1, 2], registrationDate: "2026-07-20" },
      { dateOfBirth: DOB.adult25, isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-07-20" },
    ], event, pricing);

    expect(r.subtotal).toBe(246);
    expect(r.surcharge).toBe(25);
    expect(r.grandTotal).toBe(271);
  });

  it("mixed group with partial including Sunday → Sunday excluded from charges", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 4, selectedDays: [1, 2, 3, 4], registrationDate: "2026-03-01" },
      { dateOfBirth: DOB.youth14, isFullDuration: false, numDays: 4, selectedDays: [1, 2, 3, 4], registrationDate: "2026-03-01" },
    ], event, pricing);

    // Both get 3 chargeable nights: 3 × $38 = $114 each
    expect(r.items[0].amount).toBe(114);
    expect(r.items[1].amount).toBe(114);
    expect(r.subtotal).toBe(228);
  });
});

// ════════════════════════════════════════════════════════════════
// 9. GROUP + MEALS — END-TO-END TOTAL CALCULATIONS
// ════════════════════════════════════════════════════════════════

describe("production — group + meals combined totals", () => {
  const event = prodEvent();
  const pricing = prodPricing();

  it("adult KOTE 2 days + 2 meals → $20 reg + $24 meals = $44 total", () => {
    // This mirrors the user's screenshot exactly
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 2, selectedDays: [2, 3], attendanceType: "kote", registrationDate: "2026-03-01" },
    ], event, pricing);

    const ageAtEvent = r.items[0].ageAtEvent;
    const mealPricePerMeal = computeMealPrice(ageAtEvent, "kote", pricing);
    const mealCount = 2;
    const mealTotal = mealCount * mealPricePerMeal;

    expect(r.grandTotal).toBe(20);          // registration
    expect(mealPricePerMeal).toBe(12);       // $12/meal for adult
    expect(mealTotal).toBe(24);              // 2 × $12
    expect(r.grandTotal + mealTotal).toBe(44); // combined total
  });

  it("family: 2 adults full + 3 meals each + late fee", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-07-10" },
      { dateOfBirth: DOB.adult25, isFullDuration: true, registrationDate: "2026-07-10" },
    ], event, pricing);

    const mealPriceAdult = computeMealPrice(40, "full_conference", pricing);
    const mealsPerPerson = 3;
    const mealTotal = 2 * mealsPerPerson * mealPriceAdult;

    expect(r.subtotal).toBe(300);           // 2 × $150
    expect(r.surcharge).toBe(25);           // late fee once
    expect(r.grandTotal).toBe(325);         // registration total
    expect(mealTotal).toBe(72);             // 6 × $12
    expect(r.grandTotal + mealTotal).toBe(397); // everything
  });

  it("family: adult + child + infant, all with meals → infant meal FREE", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-03-01" },
      { dateOfBirth: DOB.child5, isFullDuration: true, registrationDate: "2026-03-01" },
      { dateOfBirth: DOB.infant0, isFullDuration: true, registrationDate: "2026-03-01" },
    ], event, pricing);

    const mealsPerPerson = 10; // all meals
    const adultMeals = mealsPerPerson * computeMealPrice(r.items[0].ageAtEvent, "full_conference", pricing);
    const childMeals = mealsPerPerson * computeMealPrice(r.items[1].ageAtEvent, "full_conference", pricing);
    const infantMeals = mealsPerPerson * computeMealPrice(r.items[2].ageAtEvent, "full_conference", pricing);

    expect(r.subtotal).toBe(200);           // $150 + $50 + $0
    expect(adultMeals).toBe(120);           // 10 × $12
    expect(childMeals).toBe(80);            // 10 × $8
    expect(infantMeals).toBe(0);            // 10 × $0 (FREE)
    expect(r.grandTotal + adultMeals + childMeals + infantMeals).toBe(400);
  });

  it("KOTE child with meals → $8/meal (not adult price)", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.child5, isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-03-01" },
    ], event, pricing);

    const mealPrice = computeMealPrice(r.items[0].ageAtEvent, "kote", pricing);
    expect(r.grandTotal).toBe(20);     // 2 × $10
    expect(mealPrice).toBe(8);         // child meal = $8, NOT $10 or $12
  });
});

// ════════════════════════════════════════════════════════════════
// 10. EDGE CASES & BOUNDARY CONDITIONS
// ════════════════════════════════════════════════════════════════

describe("production — edge cases", () => {
  const event = prodEvent();
  const pricing = prodPricing();

  it("child age 10 is child (not youth) with production threshold 11", () => {
    const age = computeAge(DOB.child10, event.start_date);
    expect(age).toBe(10);
    expect(deriveCategory(age, event.adult_age_threshold, event.youth_age_threshold)).toBe("child");
  });

  it("age 11 is youth (not child) with production threshold 11", () => {
    const age = computeAge(DOB.youth11, event.start_date);
    expect(age).toBe(11);
    expect(deriveCategory(age, event.adult_age_threshold, event.youth_age_threshold)).toBe("youth");
  });

  it("single registrant group still gets surcharge", () => {
    const r = computeGroupPricing([
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-07-30" },
    ], event, pricing);
    expect(r.surcharge).toBe(50);
    expect(r.grandTotal).toBe(200);
  });

  it("partial with no selectedDays falls back to numDays (no Sunday exclusion)", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, numDays: 3, registrationDate: "2026-03-01" },
      event, pricing
    );
    // Without selectedDays, countChargeableNights returns numDays as-is
    expect(r.baseAmount).toBe(114); // 3 × $38
  });

  it("partial with numDays undefined → defaults to 1 day", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.baseAmount).toBe(38); // 1 × $38
  });

  it("KOTE with numDays undefined → defaults to 1 day", () => {
    const r = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: false, attendanceType: "kote", registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(r.amount).toBe(10); // 1 × $10
  });

  it("explanation detail is well-formed for every path", () => {
    const fullAdult = computePricing(
      { dateOfBirth: DOB.adult40, isFullDuration: true, registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(fullAdult.explanationDetail).toContain("$150.00");
    expect(fullAdult.explanationDetail).toContain("Total:");

    const partialYouth = computePricing(
      { dateOfBirth: DOB.youth14, isFullDuration: false, numDays: 2, selectedDays: [1, 2], registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(partialYouth.explanationDetail).toContain("$38.00");

    const kote = computePricing(
      { dateOfBirth: DOB.adult25, isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-03-01" },
      event, pricing
    );
    expect(kote.explanationDetail).toContain("KOTE");
    expect(kote.explanationDetail).toContain("$10.00/day");

    const infant = computePricing(
      { dateOfBirth: DOB.infant0, isFullDuration: true },
      event, pricing
    );
    expect(infant.explanationDetail).toContain("free");
  });
});

// ════════════════════════════════════════════════════════════════
// 11. SURCHARGE TIER BOUNDARY CONDITIONS
// ════════════════════════════════════════════════════════════════

describe("production — surcharge tier boundary dates", () => {
  it("Jun 30 (day before tier 1) → no surcharge", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-06-30"))).toBeNull();
  });

  it("Jul 1 (first day of tier 1) → $25", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-07-01"))!.amount).toBe(25);
  });

  it("Jul 29 (last day of tier 1) → $25", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-07-29"))!.amount).toBe(25);
  });

  it("Jul 30 (first day of tier 2 / event day 1) → $50", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-07-30"))!.amount).toBe(50);
  });

  it("Aug 2 (last day of tier 2 / event last day) → $50", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-08-02"))!.amount).toBe(50);
  });

  it("Aug 3 (day after event) → no surcharge", () => {
    expect(findSurchargeTier(PROD_LATE_TIERS, parseISO("2026-08-03"))).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════
// 12. MEAL PRICING — BOUNDARY AGE CASES
// ════════════════════════════════════════════════════════════════

describe("production — meal pricing boundary ages", () => {
  const pricing = prodPricing();

  it("age 1 → FREE (under threshold 2)", () => {
    expect(computeMealPrice(1, "full_conference", pricing)).toBe(0);
  });

  it("age 2 → $8 (at threshold, starts child rate)", () => {
    expect(computeMealPrice(2, "full_conference", pricing)).toBe(8);
  });

  it("age 10 → $8 (at child max age)", () => {
    expect(computeMealPrice(10, "full_conference", pricing)).toBe(8);
  });

  it("age 11 → $12 (first age above child max → adult rate)", () => {
    expect(computeMealPrice(11, "full_conference", pricing)).toBe(12);
  });

  it("age 17 → $12 (youth pays adult rate)", () => {
    expect(computeMealPrice(17, "full_conference", pricing)).toBe(12);
  });

  it("age 18 → $12 (adult rate)", () => {
    expect(computeMealPrice(18, "full_conference", pricing)).toBe(12);
  });
});

// ════════════════════════════════════════════════════════════════
// 13. REALISTIC FAMILY SCENARIOS — FULL WALK-THROUGH
// ════════════════════════════════════════════════════════════════

describe("production — realistic family registration walk-throughs", () => {
  const event = prodEvent();
  const pricing = prodPricing();

  it("Scenario A: Family of 5, early bird, full conference, all meals (10 meals each)", () => {
    // Dad (40), Mom (38), Teen (14), Kid (5), Baby (0)
    const r = computeGroupPricing([
      { dateOfBirth: "1986-01-01", isFullDuration: true, registrationDate: "2026-04-01" }, // adult $150
      { dateOfBirth: "1988-01-01", isFullDuration: true, registrationDate: "2026-04-01" }, // adult $150
      { dateOfBirth: "2012-01-01", isFullDuration: true, registrationDate: "2026-04-01" }, // youth $100
      { dateOfBirth: "2021-01-01", isFullDuration: true, registrationDate: "2026-04-01" }, // child $50
      { dateOfBirth: "2026-01-01", isFullDuration: true, registrationDate: "2026-04-01" }, // infant $0
    ], event, pricing);

    expect(r.subtotal).toBe(450); // 150 + 150 + 100 + 50 + 0
    expect(r.surcharge).toBe(0);
    expect(r.grandTotal).toBe(450);

    // Meals: 10 meals each
    const mealTotal = [40, 38, 14, 5, 0].reduce((sum, age) => {
      return sum + 10 * computeMealPrice(age, "full_conference", pricing);
    }, 0);
    // 10×$12 + 10×$12 + 10×$12 + 10×$8 + 10×$0 = 120+120+120+80+0 = $440
    expect(mealTotal).toBe(440);
    expect(r.grandTotal + mealTotal).toBe(890);
  });

  it("Scenario B: Same family, on-site registration", () => {
    const r = computeGroupPricing([
      { dateOfBirth: "1986-01-01", isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: "1988-01-01", isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: "2012-01-01", isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: "2021-01-01", isFullDuration: true, registrationDate: "2026-07-30" },
      { dateOfBirth: "2026-01-01", isFullDuration: true, registrationDate: "2026-07-30" },
    ], event, pricing);

    expect(r.subtotal).toBe(450);
    expect(r.surcharge).toBe(50); // on-site fee applied ONCE
    expect(r.grandTotal).toBe(500);
  });

  it("Scenario C: Couple, partial 2 days (Fri+Sat), late registration", () => {
    const r = computeGroupPricing([
      { dateOfBirth: "1990-01-01", isFullDuration: false, numDays: 2, selectedDays: [2, 3], registrationDate: "2026-07-20" },
      { dateOfBirth: "1992-01-01", isFullDuration: false, numDays: 2, selectedDays: [2, 3], registrationDate: "2026-07-20" },
    ], event, pricing);

    // 2 non-Sunday days × $38 = $76 each
    expect(r.items[0].amount).toBe(76);
    expect(r.items[1].amount).toBe(76);
    expect(r.subtotal).toBe(152);
    expect(r.surcharge).toBe(25);
    expect(r.grandTotal).toBe(177);
  });

  it("Scenario D: KOTE adult walk-in, 2 days, 4 meals, on-site", () => {
    const r = computeGroupPricing([
      { dateOfBirth: "1990-01-01", isFullDuration: false, numDays: 2, selectedDays: [2, 3], attendanceType: "kote", registrationDate: "2026-07-31" },
    ], event, pricing);

    const mealTotal = 4 * computeMealPrice(36, "kote", pricing); // 4 × $12

    expect(r.grandTotal).toBe(70);  // $20 + $50 on-site
    expect(mealTotal).toBe(48);     // 4 × $12
    expect(r.grandTotal + mealTotal).toBe(118);
  });

  it("Scenario E: Youth group (3 youths), partial 3 days (Thu-Sat), early bird", () => {
    const r = computeGroupPricing([
      { dateOfBirth: "2012-06-01", isFullDuration: false, numDays: 3, selectedDays: [1, 2, 3], registrationDate: "2026-03-01" },
      { dateOfBirth: "2013-01-01", isFullDuration: false, numDays: 3, selectedDays: [1, 2, 3], registrationDate: "2026-03-01" },
      { dateOfBirth: "2014-03-15", isFullDuration: false, numDays: 3, selectedDays: [1, 2, 3], registrationDate: "2026-03-01" },
    ], event, pricing);

    // 3 non-Sunday days × $38 = $114 each
    expect(r.items[0].amount).toBe(114);
    expect(r.items[1].amount).toBe(114);
    expect(r.items[2].amount).toBe(114);
    expect(r.subtotal).toBe(342);
    expect(r.surcharge).toBe(0);
    expect(r.grandTotal).toBe(342);
  });

  it("Scenario F: Large church group (10 adults), on-site → single $50 surcharge", () => {
    const adults = Array.from({ length: 10 }, () => ({
      dateOfBirth: "1990-01-01" as string,
      isFullDuration: true as const,
      registrationDate: "2026-07-30",
    }));

    const r = computeGroupPricing(adults, event, pricing);

    expect(r.subtotal).toBe(1500); // 10 × $150
    expect(r.surcharge).toBe(50);  // ONE surcharge, not 10
    expect(r.grandTotal).toBe(1550);
  });
});
