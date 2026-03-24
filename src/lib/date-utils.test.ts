import { describe, it, expect } from "vitest";
import {
  dayNumberToDate,
  formatDayNumber,
  formatSelectedDays,
  formatSelectedDaysShort,
  selectedDaysToDateStrings,
} from "./date-utils";

const EVENT_START = "2026-07-30"; // Thursday

describe("dayNumberToDate", () => {
  it("returns the start date for day 1", () => {
    const d = dayNumberToDate(EVENT_START, 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July = 6
    expect(d.getDate()).toBe(30);
  });

  it("advances correctly for day 3", () => {
    const d = dayNumberToDate(EVENT_START, 3);
    expect(d.getMonth()).toBe(7); // August = 7
    expect(d.getDate()).toBe(1);
  });

  it("handles month boundary crossing", () => {
    const d = dayNumberToDate(EVENT_START, 5);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(3);
  });
});

describe("formatDayNumber", () => {
  it("formats day 1 correctly", () => {
    expect(formatDayNumber(EVENT_START, 1)).toBe("Thu, Jul 30");
  });

  it("formats day crossing month boundary", () => {
    expect(formatDayNumber(EVENT_START, 3)).toBe("Sat, Aug 1");
  });
});

describe("formatSelectedDays", () => {
  it("returns empty string for empty array", () => {
    expect(formatSelectedDays(EVENT_START, [])).toBe("");
  });

  it("formats single day", () => {
    expect(formatSelectedDays(EVENT_START, [1])).toBe("Thu, Jul 30");
  });

  it("formats multiple days sorted", () => {
    expect(formatSelectedDays(EVENT_START, [3, 1])).toBe(
      "Thu, Jul 30, Sat, Aug 1"
    );
  });
});

describe("formatSelectedDaysShort", () => {
  it("returns empty string for empty array", () => {
    expect(formatSelectedDaysShort(EVENT_START, [])).toBe("");
  });

  it("formats as short day names", () => {
    expect(formatSelectedDaysShort(EVENT_START, [1, 2, 3])).toBe(
      "Thu · Fri · Sat"
    );
  });
});

describe("selectedDaysToDateStrings", () => {
  it("converts day numbers to ISO date strings", () => {
    expect(selectedDaysToDateStrings(EVENT_START, [1, 2, 3])).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(selectedDaysToDateStrings(EVENT_START, [])).toEqual([]);
  });
});
