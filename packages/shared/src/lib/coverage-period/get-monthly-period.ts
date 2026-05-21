// get-monthly-period.ts — v2 spec function from L211 + L218.
//
// Returns the Period for a calendar month at the tenant's timezone offset.
// Half-open [start, end). Label format "MAY 2026" (uppercase, English month name).

import type { Period } from "./types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "./types";

const MONTH_LABELS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

/**
 * @param year   Full year, e.g. 2026
 * @param month  1-indexed month (1 = January, 12 = December) — matches user-
 *               facing convention and ISO 8601. NOT JavaScript's 0-indexed
 *               Date month.
 * @param offsetMinutes Tenant timezone offset east of UTC in minutes. Default
 *               +480 (UTC+8) matches both Mindoro and Banggai. Pass 0 for UTC.
 */
export function getMonthlyPeriod(
  year: number,
  month: number,
  offsetMinutes: number = DEFAULT_TENANT_OFFSET_MINUTES,
): Period {
  if (!Number.isInteger(year)) {
    throw new Error(
      `getMonthlyPeriod: year must be an integer, got ${String(year)}`,
    );
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(
      `getMonthlyPeriod: month must be 1..12 (1-indexed), got ${String(month)}`,
    );
  }

  const offsetMs = offsetMinutes * 60_000;
  // UTC instant of midnight tenant-local on day 1 of the target month.
  const startUtcMs = Date.UTC(year, month - 1, 1) - offsetMs;
  // UTC instant of midnight tenant-local on day 1 of the following month.
  const endUtcMs = Date.UTC(year, month, 1) - offsetMs;

  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
    label: `${MONTH_LABELS[month - 1] ?? ""} ${String(year)}`,
    category: "monthly",
  };
}
