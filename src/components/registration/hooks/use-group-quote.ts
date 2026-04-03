"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Event } from "@/types/database";
import type { AgeCategory } from "@/types/database";
import {
  getAmharicAgeBands,
  getEnglishSubBands,
  getRepresentativeAge as _getRepresentativeAge,
  syntheticDob as _syntheticDob,
  shouldShowGradeSelector as _shouldShowGradeSelector,
  getGradeLevelOptions as _getGradeLevelOptions,
  type AgeBandConfig,
  type EnglishSubBand,
  type GradeLevel,
} from "@/lib/registration/age-bands";

// Canonical age keys only — ALL registrants use these
type AgeRangeKey = "infant" | "child" | "youth" | "adult" | "";

type AttendanceTypeKey = "full_conference" | "partial" | "kote" | "";

type Registrant = {
  id: string;
  firstName: string;
  lastName: string;
  serviceLanguage: string;
  ageRange: AgeRangeKey;
  attendanceType: AttendanceTypeKey;
  isFullDuration: boolean | null;
  isStayingInMotel: boolean | null;
  numDays: number;
  selectedDays: number[];
  selectedMealIds: string[];
};

export type ItemQuote = {
  category: AgeCategory;
  ageAtEvent: number;
  amount: number;
  explanationCode: string;
  explanationDetail: string;
  mealCount: number;
  mealPriceEach: number;
  mealTotal: number;
};

export type GroupQuote = {
  items: ItemQuote[];
  subtotal: number;
  surcharge: number;
  surchargeLabel: string | null;
  mealTotal: number;
  grandTotal: number;
};

type AgeLabels = { infant: string; child: string; youth: string; adult: string };

export function getAgeRangeOptions(event: Event, labels: AgeLabels) {
  const infant = event.infant_age_threshold ?? 3;
  const youth = event.youth_age_threshold;
  const adult = event.adult_age_threshold;
  return [
    { key: "infant" as const, name: labels.infant, range: `0–${infant}`,             label: `0–${infant} ${labels.infant}`, representativeAge: Math.max(0, Math.floor(infant / 2)) },
    { key: "child" as const,  name: labels.child,  range: `${infant + 1}–${youth - 1}`, label: `${infant + 1}–${youth - 1} ${labels.child}`, representativeAge: Math.floor((infant + 1 + youth - 1) / 2) },
    { key: "youth" as const,  name: labels.youth,  range: `${youth}–${adult - 1}`,   label: `${youth}–${adult - 1} ${labels.youth}`, representativeAge: Math.floor((youth + adult - 1) / 2) },
    { key: "adult" as const,  name: labels.adult,  range: `${adult}+`,               label: `${adult}+ ${labels.adult}`, representativeAge: adult + 10 },
  ];
}

// ─── Re-export helpers from centralized config ──────────────────
export type GradeLevelKey = GradeLevel | "";

/** English sub-band options for a given canonical age range (classroom grouping) */
export function getEnglishSubBandOptions(canonicalKey: string) {
  return getEnglishSubBands(canonicalKey);
}

/** Grade level options — delegates to centralized config */
export const getGradeLevelOptions = _getGradeLevelOptions;

/** Whether to show grade selector — delegates to centralized config */
export const shouldShowGradeSelector = _shouldShowGradeSelector;

/**
 * Get the representative age for a canonical age band.
 * ageRange is ALWAYS a canonical key (infant/child/youth/adult).
 */
export function getRepresentativeAge(
  ageRange: string,
  event: Event,
): number {
  return _getRepresentativeAge(ageRange, {
    infant: event.infant_age_threshold ?? 3,
    youth: event.youth_age_threshold,
    adult: event.adult_age_threshold,
  });
}

/** Synthetic DOB — delegates to centralized config */
export const syntheticDob = _syntheticDob;

export function useGroupQuote(event: Event, registrants: Registrant[], ageLabels: AgeLabels) {
  const [groupQuote, setGroupQuote] = useState<GroupQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGroupQuote = useCallback(async () => {
    const ageOpts = getAgeRangeOptions(event, ageLabels);
    const validRegistrants = registrants.filter((r) => {
      if (!r.ageRange || !r.attendanceType) return false;
      if (r.attendanceType === "full_conference") return true;
      if (r.attendanceType === "kote") return r.selectedDays.length >= 1;
      // partial: needs at least one day selected
      return r.selectedDays.length >= 1;
    });

    if (validRegistrants.length === 0) {
      setGroupQuote(null);
      setQuoteError(null);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetch("/api/pricing/quote-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          registrants: validRegistrants.map((r) => {
            const repAge = getRepresentativeAge(r.ageRange, event);
            const attType = r.attendanceType || (r.isFullDuration ? "full_conference" : "partial");
            return {
              dateOfBirth: syntheticDob(repAge, event.start_date),
              isFullDuration: attType === "full_conference",
              isStayingInMotel: false,
              numDays: attType !== "full_conference" ? r.selectedDays.length : undefined,
              selectedDays: attType !== "full_conference" ? r.selectedDays : undefined,
              attendanceType: attType,
              mealServiceIds: r.selectedMealIds.length > 0 ? r.selectedMealIds : undefined,
            };
          }),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroupQuote(data);
      } else {
        setQuoteError("Unable to calculate pricing. Please try again.");
      }
    } catch {
      setQuoteError("Network error. Pricing may be unavailable.");
    } finally {
      setQuoteLoading(false);
    }
  }, [event.id, registrants]);

  // Debounced quote fetching
  useEffect(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    quoteTimerRef.current = setTimeout(fetchGroupQuote, 400);
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [fetchGroupQuote]);

  return { groupQuote, quoteLoading, quoteError };
}
