/**
 * Centralized age-band configuration.
 *
 * SINGLE SOURCE OF TRUTH for:
 *  - Canonical age bands (PRIMARY selector for ALL registrants, both services)
 *  - English service sub-bands (SECONDARY selector for classroom grouping)
 *  - Representative ages (used for synthetic DOB → pricing)
 *  - Pricing category mapping (child / youth / adult)
 *  - Grade selector eligibility
 *
 * Design:
 *  1. ALL registrants select from canonical age bands (infant/child/youth/adult)
 *  2. English-service registrants get a SECONDARY sub-band selector for
 *     classroom/service grouping (e.g. "Young Adults" vs "Adults" within adult)
 *  3. Pricing is ALWAYS determined by the canonical band — never by the sub-band
 */

import type { AgeCategory } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────

export type ServiceLanguage = "amharic" | "english";

export type GradeLevel =
  | "7th-8th"
  | "9th-10th"
  | "11th"
  | "12th"
  | "college_career";

export type AgeBandConfig = {
  key: string;
  name: string;
  range: string;
  category: AgeCategory;
  representativeAge: number;
};

export type EnglishSubBand = {
  key: string;
  label: string;
  range: string;
  hasGradeSelector?: boolean;
};

// ─── Canonical Age Bands (used for ALL registrants) ─────────────

export function getAmharicAgeBands(
  infantThreshold: number,
  youthThreshold: number,
  adultThreshold: number,
  labels?: { infant?: string; child?: string; youth?: string; adult?: string }
): AgeBandConfig[] {
  const l = {
    infant: labels?.infant ?? "Infant/Toddler",
    child: labels?.child ?? "Child",
    youth: labels?.youth ?? "Youth",
    adult: labels?.adult ?? "Adult",
  };
  return [
    {
      key: "infant",
      name: l.infant,
      range: `0–${infantThreshold}`,
      category: "child",
      representativeAge: Math.max(0, Math.floor(infantThreshold / 2)),
    },
    {
      key: "child",
      name: l.child,
      range: `${infantThreshold + 1}–${youthThreshold - 1}`,
      category: "child",
      representativeAge: Math.floor((infantThreshold + 1 + youthThreshold - 1) / 2),
    },
    {
      key: "youth",
      name: l.youth,
      range: `${youthThreshold}–${adultThreshold - 1}`,
      category: "youth",
      representativeAge: Math.floor((youthThreshold + adultThreshold - 1) / 2),
    },
    {
      key: "adult",
      name: l.adult,
      range: `${adultThreshold}+`,
      category: "adult",
      representativeAge: adultThreshold + 10,
    },
  ];
}

// ─── English Service Sub-Bands (secondary, classroom grouping) ──
//
// Shown AFTER canonical age selection, ONLY for English service.
// These determine which English-service classroom/group the
// registrant belongs to. They do NOT affect pricing.

const ENGLISH_SUB_BANDS: Record<string, EnglishSubBand[]> = {
  infant: [
    { key: "nursery", label: "Nursery", range: "0–2" },
  ],
  child: [
    { key: "nursery",  label: "Nursery",  range: "0–2" },
    { key: "children", label: "Children", range: "3–12" },
  ],
  youth: [
    { key: "children", label: "Children", range: "3–12" },
    { key: "teens",    label: "Teens",    range: "13–17", hasGradeSelector: true },
  ],
  adult: [
    { key: "young_adults", label: "Young Adults", range: "18–24", hasGradeSelector: true },
    { key: "adults",       label: "Adults",       range: "25+" },
  ],
};

/**
 * Get English sub-band options for a given canonical age range.
 * Returns empty array for unknown canonical keys.
 */
export function getEnglishSubBands(canonicalKey: string): EnglishSubBand[] {
  return ENGLISH_SUB_BANDS[canonicalKey] ?? [];
}

// ─── Lookups (always canonical) ─────────────────────────────────

/**
 * Get the representative age for a canonical age band.
 * `bandKey` is ALWAYS a canonical key (infant/child/youth/adult).
 */
export function getRepresentativeAge(
  bandKey: string,
  eventThresholds?: { infant: number; youth: number; adult: number }
): number {
  const t = eventThresholds ?? { infant: 3, youth: 13, adult: 18 };
  const bands = getAmharicAgeBands(t.infant, t.youth, t.adult);
  return bands.find((b) => b.key === bandKey)?.representativeAge ?? (t.adult + 10);
}

/**
 * Get the pricing category for a canonical age band.
 */
export function getCategory(
  bandKey: string,
  eventThresholds?: { infant: number; youth: number; adult: number }
): AgeCategory {
  const t = eventThresholds ?? { infant: 3, youth: 13, adult: 18 };
  const bands = getAmharicAgeBands(t.infant, t.youth, t.adult);
  return bands.find((b) => b.key === bandKey)?.category ?? "adult";
}

/**
 * Create a synthetic date of birth from a representative age.
 */
export function syntheticDob(representativeAge: number, eventStartDate: string): string {
  const eventYear = new Date(eventStartDate).getFullYear();
  const birthYear = eventYear - representativeAge;
  return `${birthYear}-01-01`;
}

/**
 * Whether the grade/level selector should be shown.
 * Based on the English sub-band key, not the canonical age range.
 */
export function shouldShowGradeSelector(serviceLanguage: string, serviceAgeBand: string): boolean {
  if (serviceLanguage !== "english" || !serviceAgeBand) return false;
  const allSubBands = Object.values(ENGLISH_SUB_BANDS).flat();
  return allSubBands.find((b) => b.key === serviceAgeBand)?.hasGradeSelector === true;
}

/**
 * Grade level options.
 */
export function getGradeLevelOptions(): { key: GradeLevel; label: string }[] {
  return [
    { key: "7th-8th",        label: "7th – 8th Grade" },
    { key: "9th-10th",       label: "9th – 10th Grade" },
    { key: "11th",           label: "11th Grade" },
    { key: "12th",           label: "12th Grade" },
    { key: "college_career", label: "College / Career" },
  ];
}

/**
 * All valid canonical band keys.
 */
export const CANONICAL_BAND_KEYS = ["infant", "child", "youth", "adult"] as const;

/**
 * All valid English sub-band keys (deduplicated) — for Zod schema validation.
 */
export const ENGLISH_SUB_BAND_KEYS = [
  ...new Set(Object.values(ENGLISH_SUB_BANDS).flat().map((b) => b.key)),
];
