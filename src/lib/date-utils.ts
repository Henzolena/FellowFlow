/**
 * Shared date utilities for converting selected_days (1-indexed day numbers)
 * to human-readable date strings across the entire system.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Convert a 1-indexed day number to an actual Date, given the event start date.
 * Parses in local timezone to avoid UTC offset issues.
 */
export function dayNumberToDate(eventStartDate: string, dayNumber: number): Date {
  const [year, month, day] = eventStartDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + dayNumber - 1);
  return d;
}

/**
 * Format a single day number into "Thu, Jul 30" style.
 */
export function formatDayNumber(eventStartDate: string, dayNumber: number): string {
  const d = dayNumberToDate(eventStartDate, dayNumber);
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Format an array of selected day numbers into a readable string.
 * e.g., [1, 3] with start "2026-07-30" → "Thu Jul 30, Sat Aug 1"
 */
export function formatSelectedDays(eventStartDate: string, selectedDays: number[]): string {
  if (!selectedDays || selectedDays.length === 0) return "";
  return selectedDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => formatDayNumber(eventStartDate, d))
    .join(", ");
}

/**
 * Format selected days as short labels for compact display.
 * e.g., [1, 3] with start "2026-07-30" → "Thu · Sat"
 */
export function formatSelectedDaysShort(eventStartDate: string, selectedDays: number[]): string {
  if (!selectedDays || selectedDays.length === 0) return "";
  return selectedDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => {
      const date = dayNumberToDate(eventStartDate, d);
      return DAY_NAMES[date.getDay()];
    })
    .join(" · ");
}

/**
 * Convert selected_days (1-indexed) to actual ISO date strings (YYYY-MM-DD).
 * Used for matching against service_catalog.service_date.
 */
export function selectedDaysToDateStrings(eventStartDate: string, selectedDays: number[]): string[] {
  return selectedDays.map((d) => {
    const date = dayNumberToDate(eventStartDate, d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
}
