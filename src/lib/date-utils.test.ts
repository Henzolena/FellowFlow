import { describe, it, expect } from "vitest";
import {
  dayNumberToDate,
  formatDayNumber,
  formatSelectedDays,
  formatSelectedDaysShort,
  selectedDaysToDateStrings,
  isDaySunday,
  countChargeableNights,
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

// EVENT_START = "2026-07-30" (Thursday)
// Day 1 = Thu Jul 30, Day 2 = Fri Jul 31, Day 3 = Sat Aug 1, Day 4 = Sun Aug 2

describe("isDaySunday", () => {
  it("day 1 (Thu) is not Sunday", () => {
    expect(isDaySunday(EVENT_START, 1)).toBe(false);
  });

  it("day 2 (Fri) is not Sunday", () => {
    expect(isDaySunday(EVENT_START, 2)).toBe(false);
  });

  it("day 3 (Sat) is not Sunday", () => {
    expect(isDaySunday(EVENT_START, 3)).toBe(false);
  });

  it("day 4 (Sun) IS Sunday", () => {
    expect(isDaySunday(EVENT_START, 4)).toBe(true);
  });

  it("works for event starting on a Sunday", () => {
    // 2026-08-02 is a Sunday
    expect(isDaySunday("2026-08-02", 1)).toBe(true);
    expect(isDaySunday("2026-08-02", 2)).toBe(false); // Monday
  });

  it("works for event starting on a Saturday", () => {
    // 2026-08-01 is a Saturday
    expect(isDaySunday("2026-08-01", 1)).toBe(false); // Sat
    expect(isDaySunday("2026-08-01", 2)).toBe(true);  // Sun
    expect(isDaySunday("2026-08-01", 3)).toBe(false); // Mon
  });
});

describe("countChargeableNights", () => {
  it("excludes Sunday from selectedDays", () => {
    // Days [1,2,3,4] → Thu,Fri,Sat,Sun → 3 chargeable
    expect(countChargeableNights(EVENT_START, [1, 2, 3, 4], 4)).toBe(3);
  });

  it("all non-Sunday days → all chargeable", () => {
    expect(countChargeableNights(EVENT_START, [1, 2, 3], 3)).toBe(3);
  });

  it("only Sunday → 0 chargeable", () => {
    expect(countChargeableNights(EVENT_START, [4], 1)).toBe(0);
  });

  it("single non-Sunday day → 1 chargeable", () => {
    expect(countChargeableNights(EVENT_START, [1], 1)).toBe(1);
  });

  it("falls back to numDays when selectedDays is null", () => {
    expect(countChargeableNights(EVENT_START, null, 3)).toBe(3);
  });

  it("falls back to numDays when selectedDays is undefined", () => {
    expect(countChargeableNights(EVENT_START, undefined, 2)).toBe(2);
  });

  it("falls back to numDays when selectedDays is empty", () => {
    expect(countChargeableNights(EVENT_START, [], 4)).toBe(4);
  });

  it("handles event with multiple Sundays (week-long event)", () => {
    // Start Mon Jul 27 2026 → Day 7 = Sun Aug 2, Day 14 = Sun Aug 9
    const weekStart = "2026-07-27"; // Monday
    // Day 7 = Sun Aug 2
    expect(isDaySunday(weekStart, 7)).toBe(true);
    // Select days 1-7, expect 6 chargeable (Mon-Sat)
    expect(countChargeableNights(weekStart, [1, 2, 3, 4, 5, 6, 7], 7)).toBe(6);
  });
});
