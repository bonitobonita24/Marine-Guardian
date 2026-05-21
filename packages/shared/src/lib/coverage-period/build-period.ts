// build-period.ts — v2 spec function from L218.
//
// Generic constructor when start/end/label are already computed by another
// path (e.g. an ad-hoc range outside the weekly/monthly/annual categories).
// Validates that end > start. Half-open: [start, end).

import type { Period, PeriodCategory } from "./types";

export function buildPeriod(
  start: Date,
  end: Date,
  label: string,
  category: PeriodCategory,
): Period {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    throw new Error("buildPeriod: start must be a valid Date");
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    throw new Error("buildPeriod: end must be a valid Date");
  }
  if (end.getTime() <= start.getTime()) {
    throw new Error("buildPeriod: end must be strictly after start");
  }
  return { start, end, label, category };
}
