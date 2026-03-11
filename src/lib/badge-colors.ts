/**
 * Centralized badge color system for categories, access tiers, statuses, and sources.
 * Used across: admin UI, receipt page, PDF badges, email receipts, check-in station.
 *
 * Each entry provides:
 *  - `tw`   — Tailwind classes for UI badges (bg + text, supports dark mode)
 *  - `hex`  — Primary hex color (for PDF / email inline styles)
 *  - `bg`   — Background hex color (for email pill backgrounds)
 *  - `label` — Human-readable label
 */

/* ── Category (adult / youth / child / infant) ─────────────────────── */

export type CategoryKey = "adult" | "youth" | "child" | "infant";

export const CATEGORY_BADGE: Record<CategoryKey, { tw: string; hex: string; bg: string; label: string }> = {
  adult: {
    tw: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    hex: "#2563eb",
    bg: "#dbeafe",
    label: "Adult",
  },
  youth: {
    tw: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    hex: "#059669",
    bg: "#d1fae5",
    label: "Youth",
  },
  child: {
    tw: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    hex: "#ea580c",
    bg: "#ffedd5",
    label: "Child",
  },
  infant: {
    tw: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    hex: "#db2777",
    bg: "#fce7f3",
    label: "Infant",
  },
};

/* ── Access Tier (FULL_ACCESS / KOTE_ACCESS) ─────────────────────── */

export type AccessTierKey = "FULL_ACCESS" | "KOTE_ACCESS";

export const ACCESS_TIER_BADGE: Record<AccessTierKey, { tw: string; hex: string; bg: string; label: string }> = {
  FULL_ACCESS: {
    tw: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    hex: "#0284c7",
    bg: "#e0f2fe",
    label: "Full Access",
  },
  KOTE_ACCESS: {
    tw: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    hex: "#d97706",
    bg: "#fef3c7",
    label: "KOTE",
  },
};

/* ── Registration Status ───────────────────────────────────────────── */

export type StatusKey = "confirmed" | "pending" | "draft" | "invited" | "cancelled" | "refunded";

export const STATUS_BADGE: Record<StatusKey, { tw: string; hex: string; bg: string; label: string }> = {
  confirmed: {
    tw: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    hex: "#16a34a",
    bg: "#dcfce7",
    label: "Confirmed",
  },
  pending: {
    tw: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    hex: "#ca8a04",
    bg: "#fef9c3",
    label: "Pending",
  },
  draft: {
    tw: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    hex: "#475569",
    bg: "#f1f5f9",
    label: "Draft",
  },
  invited: {
    tw: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    hex: "#7c3aed",
    bg: "#ede9fe",
    label: "Invited",
  },
  cancelled: {
    tw: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    hex: "#dc2626",
    bg: "#fee2e2",
    label: "Cancelled",
  },
  refunded: {
    tw: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    hex: "#4b5563",
    bg: "#f3f4f6",
    label: "Refunded",
  },
};

/* ── Registration Source ───────────────────────────────────────────── */

export type SourceKey = "self" | "admin_prefill" | "admin_direct";

export const SOURCE_BADGE: Record<SourceKey, { tw: string; hex: string; bg: string; label: string }> = {
  self: {
    tw: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    hex: "#6b7280",
    bg: "#f3f4f6",
    label: "Self",
  },
  admin_prefill: {
    tw: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    hex: "#7c3aed",
    bg: "#ede9fe",
    label: "Pre-fill",
  },
  admin_direct: {
    tw: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    hex: "#4f46e5",
    bg: "#e0e7ff",
    label: "Admin",
  },
};

/* ── Attendance Type ───────────────────────────────────────────────── */

export type AttendanceKey = "full_conference" | "partial" | "kote";

export const ATTENDANCE_BADGE: Record<AttendanceKey, { tw: string; hex: string; bg: string; label: string }> = {
  full_conference: {
    tw: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    hex: "#0284c7",
    bg: "#e0f2fe",
    label: "Full Conference",
  },
  partial: {
    tw: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    hex: "#0d9488",
    bg: "#ccfbf1",
    label: "Partial",
  },
  kote: {
    tw: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    hex: "#d97706",
    bg: "#fef3c7",
    label: "KOTE",
  },
};

/* ── Helpers ────────────────────────────────────────────────────────── */

export function getCategoryBadge(cat: string | null | undefined) {
  return CATEGORY_BADGE[(cat as CategoryKey)] ?? CATEGORY_BADGE.adult;
}

export function getAccessTierBadge(tier: string | null | undefined) {
  return ACCESS_TIER_BADGE[(tier as AccessTierKey)] ?? ACCESS_TIER_BADGE.FULL_ACCESS;
}

export function getStatusBadge(status: string | null | undefined) {
  return STATUS_BADGE[(status as StatusKey)] ?? STATUS_BADGE.pending;
}

export function getSourceBadge(source: string | null | undefined) {
  return SOURCE_BADGE[(source as SourceKey)] ?? SOURCE_BADGE.self;
}

export function getAttendanceBadge(type: string | null | undefined) {
  return ATTENDANCE_BADGE[(type as AttendanceKey)] ?? ATTENDANCE_BADGE.full_conference;
}

/**
 * Generate an inline HTML badge pill for emails.
 * Returns a <span> with inline styles using the badge's hex + bg colors.
 */
export function emailBadgePill(label: string, hex: string, bg: string): string {
  return `<span style="display:inline-block;background:${bg};color:${hex};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.3px;text-transform:uppercase;">${label}</span>`;
}
