// build-weekly-period.ts — internal helper for weekly Period construction.
//
// Given the UTC instant of midnight Monday tenant-local, builds the 7-day
// half-open Period with ISO week label. Shared by getMonthWeekPeriods and
// getLastCompletedWeek to avoid a circular import.

import type { Period } from "./types";
import { getIsoWeek, MONTH_LABELS_SHORT } from "./iso-week";

export function buildWeeklyPeriodFromMonday(
  mondayUtcMs: number,
  offsetMinutes: number,
): Period {
  const offsetMs = offsetMinutes * 60_000;
  const endUtcMs = mondayUtcMs + 7 * 86_400_000;
  const tenantLocalMonday = new Date(mondayUtcMs + offsetMs);
  const tenantLocalSunday = new Date(mondayUtcMs + offsetMs + 6 * 86_400_000);
  const { weekNumber } = getIsoWeek(tenantLocalMonday);
  const startMonth = MONTH_LABELS_SHORT[tenantLocalMonday.getUTCMonth()] ?? "";
  const endMonth = MONTH_LABELS_SHORT[tenantLocalSunday.getUTCMonth()] ?? "";
  const startDay = String(tenantLocalMonday.getUTCDate());
  const endDay = String(tenantLocalSunday.getUTCDate());
  const labelYear = String(tenantLocalSunday.getUTCFullYear());
  const weekNumberLabel = String(weekNumber);
  const label =
    tenantLocalMonday.getUTCMonth() === tenantLocalSunday.getUTCMonth()
      ? `Week ${weekNumberLabel} (${startMonth} ${startDay}–${endDay}, ${labelYear})`
      : `Week ${weekNumberLabel} (${startMonth} ${startDay}–${endMonth} ${endDay}, ${labelYear})`;
  return {
    start: new Date(mondayUtcMs),
    end: new Date(endUtcMs),
    label,
    category: "weekly",
  };
}
