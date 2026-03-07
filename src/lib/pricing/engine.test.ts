import { describe, it, expect } from "vitest";
import {
  computeAge,
  deriveCategory,
  findSurchargeTier,
  computePricing,
  computeGroupPricing,
  getExplanationLabel,
} from "./engine";
import type { Event, PricingConfig, SurchargeTier } from "@/types/database";

// ─── Test fixtures ───

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    name: "Test Conference",
    description: null,
    start_date: "2026-07-01",
    end_date: "2026-07-05",
    duration_days: 5,
    adult_age_threshold: 18,
    youth_age_threshold: 13,
    infant_age_threshold: 3,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePricing(overrides: Partial<PricingConfig> = {}): PricingConfig {
  return {
    id: "pc-1",
    event_id: "evt-1",
    adult_full_price: 100,
    adult_daily_price: 25,
    youth_full_price: 75,
    youth_daily_price: 20,
    child_full_price: 50,
    child_daily_price: 15,
    motel_stay_free: true,
    kote_daily_price: 10,
    lodging_fee: 0,
    late_surcharge_tiers: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const SURCHARGE_TIERS: SurchargeTier[] = [
  {
    start_date: "2026-06-01",
    end_date: "2026-06-15",
    amount: 10,
    label: "Early Late Fee",
  },
  {
    start_date: "2026-06-16",
    end_date: "2026-06-30",
    amount: 25,
    label: "Late Registration Fee",
  },
];

// ─── computeAge ───

describe("computeAge", () => {
  it("computes age correctly for an adult", () => {
    expect(computeAge("1990-03-15", "2026-07-01")).toBe(36);
  });

  it("computes age correctly when birthday has not occurred yet in event year", () => {
    // Born Aug 15 2008, event Jul 1 2026 → still 17
    expect(computeAge("2008-08-15", "2026-07-01")).toBe(17);
  });

  it("computes age correctly when birthday is on event start date", () => {
    // Born Jul 1 2008, event Jul 1 2026 → 18
    expect(computeAge("2008-07-01", "2026-07-01")).toBe(18);
  });

  it("computes age for an infant", () => {
    expect(computeAge("2024-01-01", "2026-07-01")).toBe(2);
  });

  it("computes age zero for a newborn", () => {
    expect(computeAge("2026-06-30", "2026-07-01")).toBe(0);
  });
});

// ─── deriveCategory ───

describe("deriveCategory", () => {
  it("returns adult for age >= adult threshold", () => {
    expect(deriveCategory(18, 18, 13)).toBe("adult");
    expect(deriveCategory(45, 18, 13)).toBe("adult");
  });

  it("returns youth for age >= youth threshold and < adult threshold", () => {
    expect(deriveCategory(13, 18, 13)).toBe("youth");
    expect(deriveCategory(17, 18, 13)).toBe("youth");
  });

  it("returns child for age < youth threshold", () => {
    expect(deriveCategory(12, 18, 13)).toBe("child");
    expect(deriveCategory(4, 18, 13)).toBe("child");
    expect(deriveCategory(0, 18, 13)).toBe("child");
  });

  it("works with non-standard thresholds", () => {
    expect(deriveCategory(20, 21, 16)).toBe("youth");
    expect(deriveCategory(15, 21, 16)).toBe("child");
  });
});

// ─── findSurchargeTier ───

describe("findSurchargeTier", () => {
  it("returns null when no tiers provided", () => {
    expect(findSurchargeTier([], new Date("2026-06-10"))).toBeNull();
  });

  it("returns the matching tier", () => {
    const tier = findSurchargeTier(SURCHARGE_TIERS, new Date("2026-06-10"));
    expect(tier).not.toBeNull();
    expect(tier!.label).toBe("Early Late Fee");
    expect(tier!.amount).toBe(10);
  });

  it("returns second tier when date falls in second window", () => {
    const tier = findSurchargeTier(SURCHARGE_TIERS, new Date("2026-06-20"));
    expect(tier).not.toBeNull();
    expect(tier!.label).toBe("Late Registration Fee");
    expect(tier!.amount).toBe(25);
  });

  it("returns null when date is outside all tiers", () => {
    expect(findSurchargeTier(SURCHARGE_TIERS, new Date("2026-05-01"))).toBeNull();
    expect(findSurchargeTier(SURCHARGE_TIERS, new Date("2026-07-05"))).toBeNull();
  });

  it("handles malformed tier dates gracefully", () => {
    const badTiers: SurchargeTier[] = [
      { start_date: "not-a-date", end_date: "also-bad", amount: 5, label: "Bad" },
    ];
    expect(findSurchargeTier(badTiers, new Date("2026-06-10"))).toBeNull();
  });
});

// ─── computePricing — solo ───

describe("computePricing", () => {
  const event = makeEvent();
  const pricing = makePricing();

  describe("infant path (FREE_INFANT)", () => {
    it("returns free for age <= infant_age_threshold", () => {
      const result = computePricing(
        { dateOfBirth: "2024-01-01", isFullDuration: true },
        event,
        pricing
      );
      expect(result.amount).toBe(0);
      expect(result.baseAmount).toBe(0);
      expect(result.surcharge).toBe(0);
      expect(result.explanationCode).toBe("FREE_INFANT");
      expect(result.category).toBe("child");
    });

    it("returns free for age 0 (newborn)", () => {
      const result = computePricing(
        { dateOfBirth: "2026-06-30", isFullDuration: false, numDays: 3 },
        event,
        pricing
      );
      expect(result.amount).toBe(0);
      expect(result.explanationCode).toBe("FREE_INFANT");
    });

    it("returns free for age exactly at infant threshold", () => {
      // Age 3 at event start → infant threshold is 3 → free
      const result = computePricing(
        { dateOfBirth: "2023-07-01", isFullDuration: true },
        event,
        pricing
      );
      expect(result.amount).toBe(0);
      expect(result.explanationCode).toBe("FREE_INFANT");
    });
  });

  describe("full duration path", () => {
    it("charges adult full price for an adult", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(100);
      expect(result.baseAmount).toBe(100);
      expect(result.surcharge).toBe(0);
      expect(result.explanationCode).toBe("FULL_ADULT");
      expect(result.category).toBe("adult");
    });

    it("charges youth full price for a youth", () => {
      // Born 2012 → age 14 at event → youth
      const result = computePricing(
        { dateOfBirth: "2012-01-01", isFullDuration: true, registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(75);
      expect(result.explanationCode).toBe("FULL_YOUTH");
      expect(result.category).toBe("youth");
    });

    it("charges child full price for a child above infant threshold", () => {
      // Born 2022 → age 4 at event → child (above infant threshold of 3)
      const result = computePricing(
        { dateOfBirth: "2022-01-01", isFullDuration: true, registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(50);
      expect(result.explanationCode).toBe("FULL_CHILD");
      expect(result.category).toBe("child");
    });
  });

  describe("partial duration — motel stay (free)", () => {
    it("returns free when staying in motel and motel_stay_free is enabled", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: true, numDays: 2 },
        event,
        pricing
      );
      expect(result.amount).toBe(0);
      expect(result.explanationCode).toBe("PARTIAL_MOTEL_FREE");
    });

    it("charges daily rate when motel_stay_free is disabled", () => {
      const pricingNoMotel = makePricing({ motel_stay_free: false });
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: true, numDays: 2, registrationDate: "2026-01-15" },
        event,
        pricingNoMotel
      );
      expect(result.amount).toBe(50); // 2 days × $25/day
      expect(result.explanationCode).toBe("PARTIAL_ADULT");
    });
  });

  describe("partial duration — daily rate", () => {
    it("charges daily rate × numDays for adult", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: false, numDays: 3, registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(75); // 3 × $25
      expect(result.baseAmount).toBe(75);
      expect(result.explanationCode).toBe("PARTIAL_ADULT");
    });

    it("charges daily rate × numDays for youth", () => {
      const result = computePricing(
        { dateOfBirth: "2012-01-01", isFullDuration: false, isStayingInMotel: false, numDays: 2, registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(40); // 2 × $20
      expect(result.explanationCode).toBe("PARTIAL_YOUTH");
    });

    it("defaults to 1 day when numDays is undefined", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: false, registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(25); // 1 × $25
    });
  });

  describe("surcharge application", () => {
    const pricingWithSurcharge = makePricing({ late_surcharge_tiers: SURCHARGE_TIERS });

    it("adds surcharge when registration date falls within a tier", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-06-10" },
        event,
        pricingWithSurcharge
      );
      expect(result.baseAmount).toBe(100);
      expect(result.surcharge).toBe(10);
      expect(result.amount).toBe(110);
      expect(result.surchargeLabel).toBe("Early Late Fee");
    });

    it("adds higher surcharge for later tier", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-06-20" },
        event,
        pricingWithSurcharge
      );
      expect(result.surcharge).toBe(25);
      expect(result.amount).toBe(125);
      expect(result.surchargeLabel).toBe("Late Registration Fee");
    });

    it("no surcharge when registration date is before all tiers", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-03-01" },
        event,
        pricingWithSurcharge
      );
      expect(result.surcharge).toBe(0);
      expect(result.amount).toBe(100);
      expect(result.surchargeLabel).toBeNull();
    });

    it("does NOT add surcharge to infant (free) registrations", () => {
      const result = computePricing(
        { dateOfBirth: "2024-01-01", isFullDuration: true, registrationDate: "2026-06-20" },
        event,
        pricingWithSurcharge
      );
      expect(result.amount).toBe(0);
      expect(result.surcharge).toBe(0);
      expect(result.explanationCode).toBe("FREE_INFANT");
    });

    it("does NOT add surcharge to motel-free registrations", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: true, registrationDate: "2026-06-20" },
        event,
        pricingWithSurcharge
      );
      expect(result.amount).toBe(0);
      expect(result.surcharge).toBe(0);
      expect(result.explanationCode).toBe("PARTIAL_MOTEL_FREE");
    });

    it("adds surcharge to partial daily rate", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: false, numDays: 2, registrationDate: "2026-06-10" },
        event,
        pricingWithSurcharge
      );
      expect(result.baseAmount).toBe(50); // 2 × $25
      expect(result.surcharge).toBe(10);
      expect(result.amount).toBe(60);
    });
  });

  describe("KOTE path", () => {
    it("charges kote_daily_price × numDays regardless of age", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, numDays: 3, attendanceType: "kote", registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(30); // 3 × $10
      expect(result.baseAmount).toBe(30);
      expect(result.explanationCode).toBe("KOTE");
    });

    it("charges $10/day for youth KOTE", () => {
      const result = computePricing(
        { dateOfBirth: "2012-01-01", isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.amount).toBe(20); // 2 × $10
      expect(result.explanationCode).toBe("KOTE");
    });

    it("still returns free for infant even with KOTE type", () => {
      const result = computePricing(
        { dateOfBirth: "2024-01-01", isFullDuration: false, numDays: 2, attendanceType: "kote" },
        event,
        pricing
      );
      expect(result.amount).toBe(0);
      expect(result.explanationCode).toBe("FREE_INFANT");
    });

    it("applies surcharge to KOTE", () => {
      const pricingWithSurcharge = makePricing({ late_surcharge_tiers: SURCHARGE_TIERS });
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, numDays: 2, attendanceType: "kote", registrationDate: "2026-06-10" },
        event,
        pricingWithSurcharge
      );
      expect(result.baseAmount).toBe(20);
      expect(result.surcharge).toBe(10);
      expect(result.amount).toBe(30);
    });

    it("uses custom kote_daily_price", () => {
      const customPricing = makePricing({ kote_daily_price: 15 });
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: false, numDays: 4, attendanceType: "kote", registrationDate: "2026-01-15" },
        event,
        customPricing
      );
      expect(result.amount).toBe(60); // 4 × $15
    });
  });

  describe("explanation detail", () => {
    it("includes pricing breakdown in detail string", () => {
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-01-15" },
        event,
        pricing
      );
      expect(result.explanationDetail).toContain("Full conference (adult)");
      expect(result.explanationDetail).toContain("$100.00");
      expect(result.explanationDetail).toContain("Total: $100.00");
    });

    it("includes surcharge in detail string when applicable", () => {
      const pricingWithSurcharge = makePricing({ late_surcharge_tiers: SURCHARGE_TIERS });
      const result = computePricing(
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-06-10" },
        event,
        pricingWithSurcharge
      );
      expect(result.explanationDetail).toContain("$10.00 Early Late Fee");
      expect(result.explanationDetail).toContain("Total: $110.00");
    });
  });
});

// ─── computeGroupPricing ───

describe("computeGroupPricing", () => {
  const event = makeEvent();
  const pricing = makePricing();
  const regDate = "2026-01-15";

  it("computes correct subtotal for a group of adults", () => {
    const result = computeGroupPricing(
      [
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: regDate },
        { dateOfBirth: "1985-06-15", isFullDuration: true, registrationDate: regDate },
      ],
      event,
      pricing
    );
    expect(result.items).toHaveLength(2);
    expect(result.subtotal).toBe(200); // 2 × $100
    expect(result.surcharge).toBe(0);
    expect(result.grandTotal).toBe(200);
  });

  it("strips individual surcharges and applies group surcharge once", () => {
    const pricingWithSurcharge = makePricing({ late_surcharge_tiers: SURCHARGE_TIERS });
    const result = computeGroupPricing(
      [
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-06-10" },
        { dateOfBirth: "1985-06-15", isFullDuration: true, registrationDate: "2026-06-10" },
      ],
      event,
      pricingWithSurcharge
    );

    // Each item should have surcharge=0 (stripped)
    for (const item of result.items) {
      expect(item.surcharge).toBe(0);
      expect(item.surchargeLabel).toBeNull();
    }

    expect(result.subtotal).toBe(200); // 2 × $100 base
    expect(result.surcharge).toBe(10); // Applied ONCE
    expect(result.surchargeLabel).toBe("Early Late Fee");
    expect(result.grandTotal).toBe(210);
  });

  it("handles mixed categories in a group", () => {
    const result = computeGroupPricing(
      [
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: regDate },  // adult: $100
        { dateOfBirth: "2012-01-01", isFullDuration: true, registrationDate: regDate },  // youth: $75
        { dateOfBirth: "2022-01-01", isFullDuration: true, registrationDate: regDate },  // child: $50
      ],
      event,
      pricing
    );
    expect(result.items[0].category).toBe("adult");
    expect(result.items[0].amount).toBe(100);
    expect(result.items[1].category).toBe("youth");
    expect(result.items[1].amount).toBe(75);
    expect(result.items[2].category).toBe("child");
    expect(result.items[2].amount).toBe(50);
    expect(result.subtotal).toBe(225);
    expect(result.grandTotal).toBe(225);
  });

  it("includes free infant registrants at $0", () => {
    const result = computeGroupPricing(
      [
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: regDate },  // adult: $100
        { dateOfBirth: "2024-01-01", isFullDuration: true, registrationDate: regDate },  // infant: $0
      ],
      event,
      pricing
    );
    expect(result.items[0].amount).toBe(100);
    expect(result.items[1].amount).toBe(0);
    expect(result.items[1].explanationCode).toBe("FREE_INFANT");
    expect(result.subtotal).toBe(100);
    expect(result.grandTotal).toBe(100);
  });

  it("applies no surcharge when all registrants are free (subtotal=0)", () => {
    const pricingWithSurcharge = makePricing({ late_surcharge_tiers: SURCHARGE_TIERS });
    const result = computeGroupPricing(
      [
        { dateOfBirth: "2024-01-01", isFullDuration: true, registrationDate: "2026-06-10" },
        { dateOfBirth: "2025-01-01", isFullDuration: true, registrationDate: "2026-06-10" },
      ],
      event,
      pricingWithSurcharge
    );
    expect(result.subtotal).toBe(0);
    expect(result.surcharge).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it("handles partial attendance with daily rates in a group", () => {
    const result = computeGroupPricing(
      [
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: false, numDays: 3, registrationDate: regDate },
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: regDate },
      ],
      event,
      pricing
    );
    expect(result.items[0].amount).toBe(75);  // 3 × $25
    expect(result.items[1].amount).toBe(100); // full
    expect(result.subtotal).toBe(175);
    expect(result.grandTotal).toBe(175);
  });

  it("handles motel-free partial registrant in a group", () => {
    const result = computeGroupPricing(
      [
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: regDate },
        { dateOfBirth: "1990-01-01", isFullDuration: false, isStayingInMotel: true, numDays: 2, registrationDate: regDate },
      ],
      event,
      pricing
    );
    expect(result.items[0].amount).toBe(100);
    expect(result.items[1].amount).toBe(0);
    expect(result.items[1].explanationCode).toBe("PARTIAL_MOTEL_FREE");
    expect(result.subtotal).toBe(100);
  });

  it("uses first registrant's registrationDate for surcharge calculation", () => {
    const pricingWithSurcharge = makePricing({ late_surcharge_tiers: SURCHARGE_TIERS });
    const result = computeGroupPricing(
      [
        { dateOfBirth: "1990-01-01", isFullDuration: true, registrationDate: "2026-06-20" }, // Late tier
        { dateOfBirth: "1985-01-01", isFullDuration: true, registrationDate: "2026-03-01" }, // Early (ignored for group surcharge)
      ],
      event,
      pricingWithSurcharge
    );
    // Surcharge is based on inputs[0].registrationDate = "2026-06-20" → $25
    expect(result.surcharge).toBe(25);
    expect(result.surchargeLabel).toBe("Late Registration Fee");
    expect(result.grandTotal).toBe(225); // 200 + 25
  });
});

// ─── getExplanationLabel ───

describe("getExplanationLabel", () => {
  it("returns correct label for known codes", () => {
    expect(getExplanationLabel("FREE_INFANT")).toBe("Infant / Toddler (Free)");
    expect(getExplanationLabel("FULL_ADULT")).toBe("Full Conference — Adult");
    expect(getExplanationLabel("PARTIAL_MOTEL_FREE")).toBe("Partial Attendance + Motel (Free)");
  });

  it("returns the code itself for unknown codes", () => {
    expect(getExplanationLabel("UNKNOWN_CODE")).toBe("UNKNOWN_CODE");
  });

  it("handles legacy FULL_MOTEL_FREE code", () => {
    expect(getExplanationLabel("FULL_MOTEL_FREE")).toBe("Full Conference + Motel (Free)");
  });
});
