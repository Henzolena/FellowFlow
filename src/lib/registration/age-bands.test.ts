import { describe, it, expect } from "vitest";
import {
  getAmharicAgeBands,
  getEnglishSubBands,
  getRepresentativeAge,
  getCategory,
  syntheticDob,
  shouldShowGradeSelector,
  getGradeLevelOptions,
  CANONICAL_BAND_KEYS,
  ENGLISH_SUB_BAND_KEYS,
} from "./age-bands";
import { computeMealPrice } from "@/lib/pricing/engine";
import type { PricingConfig } from "@/types/database";

// Minimal pricing config matching production defaults
const PRICING: PricingConfig = {
  id: "test",
  event_id: "test",
  adult_full_price: 150,
  adult_daily_price: 38,
  youth_full_price: 100,
  youth_daily_price: 38,
  child_full_price: 0,
  child_daily_price: 0,
  kote_daily_price: 10,
  lodging_fee: 0,
  meal_price_adult: 12,
  meal_price_child: 8,
  meal_price_youth: 10,
  meal_price_kote: 10,
  meal_free_age_threshold: 2,
  meal_child_max_age: 10,
  late_surcharge_tiers: [],
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// Actual production thresholds from the database
const PROD_THRESHOLDS = { infant: 1, youth: 11, adult: 18 };

// ─── Canonical Age Bands ────────────────────────────────────

describe("getAmharicAgeBands", () => {
  const bands = getAmharicAgeBands(1, 11, 18);

  it("returns 4 bands", () => {
    expect(bands).toHaveLength(4);
  });

  it("infant band: key 'infant', range 0–1, category 'child', repAge 0", () => {
    expect(bands[0].key).toBe("infant");
    expect(bands[0].range).toBe("0–1");
    expect(bands[0].category).toBe("child");
    expect(bands[0].representativeAge).toBe(0);
  });

  it("child band: range 2–10, repAge 6", () => {
    expect(bands[1].key).toBe("child");
    expect(bands[1].range).toBe("2–10");
    expect(bands[1].representativeAge).toBe(6);
  });

  it("youth band: range 11–17, repAge 14", () => {
    expect(bands[2].key).toBe("youth");
    expect(bands[2].range).toBe("11–17");
    expect(bands[2].category).toBe("youth");
    expect(bands[2].representativeAge).toBe(14);
  });

  it("adult band: range 18+, repAge 28", () => {
    expect(bands[3].key).toBe("adult");
    expect(bands[3].category).toBe("adult");
    expect(bands[3].representativeAge).toBe(28);
  });
});

// ─── English Sub-Bands ─────────────────────────────────────

describe("getEnglishSubBands", () => {
  it("infant has 1 sub-band (nursery, auto-selected)", () => {
    const subs = getEnglishSubBands("infant");
    expect(subs).toHaveLength(1);
    expect(subs[0].key).toBe("nursery");
  });

  it("child has 2 sub-bands: nursery and children", () => {
    const subs = getEnglishSubBands("child");
    expect(subs).toHaveLength(2);
    expect(subs.map((s) => s.key)).toEqual(["nursery", "children"]);
  });

  it("youth has 2 sub-bands: children and teens", () => {
    const subs = getEnglishSubBands("youth");
    expect(subs).toHaveLength(2);
    expect(subs.map((s) => s.key)).toEqual(["children", "teens"]);
  });

  it("adult has 2 sub-bands: young_adults and adults", () => {
    const subs = getEnglishSubBands("adult");
    expect(subs).toHaveLength(2);
    expect(subs.map((s) => s.key)).toEqual(["young_adults", "adults"]);
  });

  it("unknown canonical key returns empty array", () => {
    expect(getEnglishSubBands("unknown")).toEqual([]);
  });

  it("teens and young_adults have grade selector", () => {
    const youthSubs = getEnglishSubBands("youth");
    expect(youthSubs.find((s) => s.key === "teens")?.hasGradeSelector).toBe(true);
    const adultSubs = getEnglishSubBands("adult");
    expect(adultSubs.find((s) => s.key === "young_adults")?.hasGradeSelector).toBe(true);
  });

  it("nursery, children, adults do NOT have grade selector", () => {
    const infantSubs = getEnglishSubBands("infant");
    expect(infantSubs[0].hasGradeSelector).toBeFalsy();
    const childSubs = getEnglishSubBands("child");
    expect(childSubs.find((s) => s.key === "children")?.hasGradeSelector).toBeFalsy();
    const adultSubs = getEnglishSubBands("adult");
    expect(adultSubs.find((s) => s.key === "adults")?.hasGradeSelector).toBeFalsy();
  });
});

// ─── getRepresentativeAge (canonical keys only) ─────────────────

describe("getRepresentativeAge", () => {
  it("returns correct ages for canonical bands (prod thresholds)", () => {
    expect(getRepresentativeAge("infant", PROD_THRESHOLDS)).toBe(0);
    expect(getRepresentativeAge("child", PROD_THRESHOLDS)).toBe(6);
    expect(getRepresentativeAge("youth", PROD_THRESHOLDS)).toBe(14);
    expect(getRepresentativeAge("adult", PROD_THRESHOLDS)).toBe(28);
  });

  it("falls back to adult repAge for unknown band", () => {
    expect(getRepresentativeAge("unknown", PROD_THRESHOLDS)).toBe(28);
  });

  it("works without explicit thresholds (uses defaults)", () => {
    // Default thresholds: infant=3, youth=13, adult=18
    expect(getRepresentativeAge("infant")).toBe(1);  // floor(3/2)
    expect(getRepresentativeAge("adult")).toBe(28);  // 18+10
  });
});

// ─── getCategory ───────────────────────────────────────────

describe("getCategory", () => {
  it("canonical band categories (prod thresholds)", () => {
    expect(getCategory("infant", PROD_THRESHOLDS)).toBe("child");
    expect(getCategory("child", PROD_THRESHOLDS)).toBe("child");
    expect(getCategory("youth", PROD_THRESHOLDS)).toBe("youth");
    expect(getCategory("adult", PROD_THRESHOLDS)).toBe("adult");
  });

  it("falls back to adult for unknown band", () => {
    expect(getCategory("unknown")).toBe("adult");
  });
});

// ─── syntheticDob ────────────────────────────────────────

describe("syntheticDob", () => {
  it("produces correct birth year", () => {
    expect(syntheticDob(15, "2026-07-30")).toBe("2011-01-01");
    expect(syntheticDob(1, "2026-07-30")).toBe("2025-01-01");
    expect(syntheticDob(30, "2026-07-30")).toBe("1996-01-01");
  });
});

// ─── shouldShowGradeSelector (sub-band keys) ────────────────────

describe("shouldShowGradeSelector", () => {
  it("true for English teens and young_adults sub-bands", () => {
    expect(shouldShowGradeSelector("english", "teens")).toBe(true);
    expect(shouldShowGradeSelector("english", "young_adults")).toBe(true);
  });

  it("false for English nursery, children, adults sub-bands", () => {
    expect(shouldShowGradeSelector("english", "nursery")).toBe(false);
    expect(shouldShowGradeSelector("english", "children")).toBe(false);
    expect(shouldShowGradeSelector("english", "adults")).toBe(false);
  });

  it("false for Amharic regardless of key", () => {
    expect(shouldShowGradeSelector("amharic", "youth")).toBe(false);
    expect(shouldShowGradeSelector("amharic", "teens")).toBe(false);
  });

  it("false for empty sub-band", () => {
    expect(shouldShowGradeSelector("english", "")).toBe(false);
  });
});

// ─── getGradeLevelOptions ──────────────────────────────────

describe("getGradeLevelOptions", () => {
  it("returns 5 grade options", () => {
    expect(getGradeLevelOptions()).toHaveLength(5);
  });

  it("includes college_career", () => {
    expect(getGradeLevelOptions().some((g) => g.key === "college_career")).toBe(true);
  });
});

// ─── Constants ───────────────────────────────────────────

describe("constants", () => {
  it("CANONICAL_BAND_KEYS has 4 keys", () => {
    expect(CANONICAL_BAND_KEYS).toEqual(["infant", "child", "youth", "adult"]);
  });

  it("ENGLISH_SUB_BAND_KEYS contains all unique sub-band keys", () => {
    expect(ENGLISH_SUB_BAND_KEYS).toContain("nursery");
    expect(ENGLISH_SUB_BAND_KEYS).toContain("children");
    expect(ENGLISH_SUB_BAND_KEYS).toContain("teens");
    expect(ENGLISH_SUB_BAND_KEYS).toContain("young_adults");
    expect(ENGLISH_SUB_BAND_KEYS).toContain("adults");
  });
});

// ─── MEAL PRICING (PRODUCTION THRESHOLDS) ──────────────────────
// Since ALL registrants use canonical bands, pricing is unified.
// No separate English pricing path exists anymore.

describe("meal pricing per canonical band", () => {
  it("infant repAge 0 → FREE", () => {
    const repAge = getRepresentativeAge("infant", PROD_THRESHOLDS);
    expect(repAge).toBe(0);
    expect(computeMealPrice(repAge, "full_conference", PRICING)).toBe(0);
  });

  it("child repAge 6 → $8", () => {
    const repAge = getRepresentativeAge("child", PROD_THRESHOLDS);
    expect(repAge).toBe(6);
    expect(computeMealPrice(repAge, "full_conference", PRICING)).toBe(8);
  });

  it("youth repAge 14 → $12", () => {
    const repAge = getRepresentativeAge("youth", PROD_THRESHOLDS);
    expect(repAge).toBe(14);
    expect(computeMealPrice(repAge, "full_conference", PRICING)).toBe(12);
  });

  it("adult repAge 28 → $12", () => {
    const repAge = getRepresentativeAge("adult", PROD_THRESHOLDS);
    expect(repAge).toBe(28);
    expect(computeMealPrice(repAge, "full_conference", PRICING)).toBe(12);
  });
});

describe("KOTE meal pricing (same age-based tiers)", () => {
  it("KOTE child pays child price ($8)", () => {
    const repAge = getRepresentativeAge("child", PROD_THRESHOLDS);
    expect(computeMealPrice(repAge, "kote", PRICING)).toBe(8);
  });

  it("KOTE youth pays adult price ($12)", () => {
    const repAge = getRepresentativeAge("youth", PROD_THRESHOLDS);
    expect(computeMealPrice(repAge, "kote", PRICING)).toBe(12);
  });

  it("KOTE adult pays adult price ($12)", () => {
    const repAge = getRepresentativeAge("adult", PROD_THRESHOLDS);
    expect(computeMealPrice(repAge, "kote", PRICING)).toBe(12);
  });

  it("KOTE infant is still FREE", () => {
    const repAge = getRepresentativeAge("infant", PROD_THRESHOLDS);
    expect(repAge).toBe(0);
    expect(computeMealPrice(repAge, "kote", PRICING)).toBe(0);
  });
});

describe("canonical repAge lands in correct pricing brackets", () => {
  it("infant repAge ≤ infantThreshold", () => {
    expect(getRepresentativeAge("infant", PROD_THRESHOLDS)).toBeLessThanOrEqual(PROD_THRESHOLDS.infant);
  });

  it("child repAge in child range", () => {
    const repAge = getRepresentativeAge("child", PROD_THRESHOLDS);
    expect(repAge).toBeGreaterThan(PROD_THRESHOLDS.infant);
    expect(repAge).toBeLessThan(PROD_THRESHOLDS.youth);
  });

  it("youth repAge in youth range", () => {
    const repAge = getRepresentativeAge("youth", PROD_THRESHOLDS);
    expect(repAge).toBeGreaterThanOrEqual(PROD_THRESHOLDS.youth);
    expect(repAge).toBeLessThan(PROD_THRESHOLDS.adult);
  });

  it("adult repAge in adult range", () => {
    expect(getRepresentativeAge("adult", PROD_THRESHOLDS)).toBeGreaterThanOrEqual(PROD_THRESHOLDS.adult);
  });
});
