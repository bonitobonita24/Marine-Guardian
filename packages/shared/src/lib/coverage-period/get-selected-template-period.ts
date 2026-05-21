// get-selected-template-period.ts — v2 spec function from L218.
//
// Dispatch entry-point used by the print-render page and the in-app Coverage
// Report UI. Given a structured selection (category + optional year/month/
// weekIndex) returns the corresponding Period.
//
// When no selection is provided, falls back to spec-mandated defaults:
//   - weekly  → last completed week
//   - monthly → current month (at tenant-local now)
//   - annual  → current year (at tenant-local now)
//
// The selection shape mirrors what ReportExport.paramsJson stores when an
// export is created. Validators in packages/shared/src/schemas/report-export
// can be tightened in a follow-up sub-batch; for 6.1a this function performs
// runtime validation and surfaces precise errors.

import type { Period, PeriodCategory } from "./types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "./types";
import { getMonthlyPeriod } from "./get-monthly-period";
import { getAnnualPeriod } from "./get-annual-period";
import { getWeeklyPeriod } from "./get-weekly-period";
import { getLastCompletedWeek } from "./get-last-completed-week";

export interface SelectedTemplatePeriodInput {
  category?: PeriodCategory;
  year?: number;
  month?: number;
  weekIndex?: number;
}

export function getSelectedTemplatePeriod(
  input: SelectedTemplatePeriodInput = {},
  now: Date = new Date(),
  offsetMinutes: number = DEFAULT_TENANT_OFFSET_MINUTES,
): Period {
  const category: PeriodCategory = input.category ?? "monthly";
  const offsetMs = offsetMinutes * 60_000;
  const nowLocal = new Date(now.getTime() + offsetMs);

  switch (category) {
    case "monthly": {
      const year = input.year ?? nowLocal.getUTCFullYear();
      const month = input.month ?? nowLocal.getUTCMonth() + 1;
      return getMonthlyPeriod(year, month, offsetMinutes);
    }
    case "annual": {
      const year = input.year ?? nowLocal.getUTCFullYear();
      return getAnnualPeriod(year, offsetMinutes);
    }
    case "weekly": {
      if (
        input.year === undefined ||
        input.month === undefined ||
        input.weekIndex === undefined
      ) {
        return getLastCompletedWeek(now, offsetMinutes);
      }
      return getWeeklyPeriod(
        input.year,
        input.month,
        input.weekIndex,
        offsetMinutes,
      );
    }
    default: {
      // Exhaustiveness check — TS will error here if PeriodCategory grows.
      const exhaustive: never = category;
      throw new Error(
        `getSelectedTemplatePeriod: unsupported category ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
