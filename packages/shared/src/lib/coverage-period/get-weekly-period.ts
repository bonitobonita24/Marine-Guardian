// get-weekly-period.ts — v2 spec function from L210 + L218.
//
// Returns a single Period spanning one ISO 8601 week (Monday 00:00 →
// next Monday 00:00, half-open) at the tenant offset.
//
// weekIndex is 0-based and refers to the array returned by
// getMonthWeekPeriods(year, month, offsetMinutes) — i.e. weeks whose Monday
// falls inside the target month at tenant-local time.
//
// Label format from spec L210: `Week 19 (May 4–10, 2026)`. Cross-month form
// (`Week 23 (May 25–Jun 7, 2026)`) is derived as the natural extension when
// Monday and Sunday fall in different months.

import type { Period } from "./types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "./types";
import { getMonthWeekPeriods } from "./get-month-week-periods";

export function getWeeklyPeriod(
  year: number,
  month: number,
  weekIndex: number,
  offsetMinutes: number = DEFAULT_TENANT_OFFSET_MINUTES,
): Period {
  if (!Number.isInteger(weekIndex) || weekIndex < 0) {
    throw new Error(
      `getWeeklyPeriod: weekIndex must be a non-negative integer, got ${String(weekIndex)}`,
    );
  }
  const weeks = getMonthWeekPeriods(year, month, offsetMinutes);
  const period = weeks[weekIndex];
  if (period === undefined) {
    throw new Error(
      `getWeeklyPeriod: weekIndex ${String(weekIndex)} out of range for ${String(year)}-${String(month)} (${String(weeks.length)} weeks available)`,
    );
  }
  return period;
}
