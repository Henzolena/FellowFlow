"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Event } from "@/types/database";
import type { AgeCategory } from "@/types/database";

type AgeRangeKey = "infant" | "child" | "youth" | "adult" | "";

type Registrant = {
  id: string;
  firstName: string;
  lastName: string;
  ageRange: AgeRangeKey;
  isFullDuration: boolean | null;
  isStayingInMotel: boolean | null;
  numDays: number;
};

export type ItemQuote = {
  category: AgeCategory;
  ageAtEvent: number;
  amount: number;
  explanationCode: string;
  explanationDetail: string;
};

export type GroupQuote = {
  items: ItemQuote[];
  subtotal: number;
  surcharge: number;
  surchargeLabel: string | null;
  grandTotal: number;
};

type AgeLabels = { infant: string; child: string; youth: string; adult: string };

export function getAgeRangeOptions(event: Event, labels: AgeLabels) {
  const infant = event.infant_age_threshold ?? 3;
  const youth = event.youth_age_threshold;
  const adult = event.adult_age_threshold;
  return [
    { key: "infant" as const, label: `0–${infant} ${labels.infant}`, representativeAge: Math.max(0, Math.floor(infant / 2)) },
    { key: "child" as const,  label: `${infant + 1}–${youth - 1} ${labels.child}`, representativeAge: Math.floor((infant + 1 + youth - 1) / 2) },
    { key: "youth" as const,  label: `${youth}–${adult - 1} ${labels.youth}`, representativeAge: Math.floor((youth + adult - 1) / 2) },
    { key: "adult" as const,  label: `${adult}+ ${labels.adult}`, representativeAge: adult + 10 },
  ];
}

export function syntheticDob(representativeAge: number, eventStartDate: string): string {
  const eventYear = new Date(eventStartDate).getFullYear();
  const birthYear = eventYear - representativeAge;
  return `${birthYear}-01-01`;
}

export function useGroupQuote(event: Event, registrants: Registrant[], ageLabels: AgeLabels) {
  const [groupQuote, setGroupQuote] = useState<GroupQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGroupQuote = useCallback(async () => {
    const ageOpts = getAgeRangeOptions(event, ageLabels);
    const validRegistrants = registrants.filter(
      (r) =>
        r.ageRange !== "" &&
        r.isFullDuration !== null &&
        (r.isFullDuration || (r.isStayingInMotel !== null && (r.isStayingInMotel || r.numDays >= 1)))
    );

    if (validRegistrants.length === 0) {
      setGroupQuote(null);
      return;
    }

    setQuoteLoading(true);
    try {
      const res = await fetch("/api/pricing/quote-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          registrants: validRegistrants.map((r) => {
            const opt = ageOpts.find((o: { key: string }) => o.key === r.ageRange);
            return {
              dateOfBirth: syntheticDob(opt?.representativeAge ?? 25, event.start_date),
              isFullDuration: r.isFullDuration,
              isStayingInMotel: r.isStayingInMotel ?? false,
              numDays: r.isFullDuration ? undefined : r.numDays,
            };
          }),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroupQuote(data);
      }
    } catch {
      // Silently fail
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

  return { groupQuote, quoteLoading };
}
