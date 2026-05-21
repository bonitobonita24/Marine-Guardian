// get-month-week-periods.ts — v2 spec function from L210 + L218.
//
// Splits a month into the ISO weeks whose MONDAY falls inside that month
// (at tenant-local time). Example: May 2026 contains 4 such Mondays:
// May 4, May 11, May 18, May 25 — returns 4 weekly Periods.
//
// Weeks ordered chronologically.

import type { Period } from "./types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "./types";
import { buildWeeklyPeriodFromMonday } from "./build-weekly-period";

export function getMonthWeekPeriods(
  year: number,
  month: number,
  offsetMinutes: number = DEFAULT_TENANT_OFFSET_MINUTES,
): Period[] {
  if (!Number.isInteger(year)) {
    throw new Error(
      `getMonthWeekPeriods: year must be an integer, got ${String(year)}`,
    );
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(
      `getMonthWeekPeriods: month must be 1..12, got ${String(month)}`,
    );
  }

  const offsetMs = offsetMinutes * 60_000;
  // First instant of the month in tenant-local time, expressed as UTC ms.
  const monthStartUtcMs = Date.UTC(year, month - 1, 1) - offsetMs;
  const monthEndUtcMs = Date.UTC(year, month, 1) - offsetMs;

  // Walk forward from month start, find the first Monday in the month.
  // getUTCDay on the tenant-local date returns 0..6 (Sun..Sat). ISO Monday = 1.
  const monthStartLocal = new Date(monthStartUtcMs + offsetMs);
  const startDayNum =
    monthStartLocal.getUTCDay() === 0 ? 7 : monthStartLocal.getUTCDay();
  // Days to add to reach Monday. If day1 IS Monday (dayNum=1), add 0.
  const daysToFirstMonday = (8 - startDayNum) % 7;
  const firstMondayUtcMs = monthStartUtcMs + daysToFirstMonday * 86_400_000;

  const weeks: Period[] = [];
  let mondayUtcMs = firstMondayUtcMs;
  while (mondayUtcMs < monthEndUtcMs) {
    weeks.push(buildWeeklyPeriodFromMonday(mondayUtcMs, offsetMinutes));
    mondayUtcMs += 7 * 86_400_000;
  }
  return weeks;
}
