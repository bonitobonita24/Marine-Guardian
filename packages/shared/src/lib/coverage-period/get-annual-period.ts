// get-annual-period.ts — v2 spec function from L212 + L218.
//
// Period for a calendar year at the tenant offset. Half-open [Jan 1, next Jan 1).
// Label format "2026 ANNUAL".

import type { Period } from "./types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "./types";

export function getAnnualPeriod(
  year: number,
  offsetMinutes: number = DEFAULT_TENANT_OFFSET_MINUTES,
): Period {
  if (!Number.isInteger(year)) {
    throw new Error(
      `getAnnualPeriod: year must be an integer, got ${String(year)}`,
    );
  }

  const offsetMs = offsetMinutes * 60_000;
  const startUtcMs = Date.UTC(year, 0, 1) - offsetMs;
  const endUtcMs = Date.UTC(year + 1, 0, 1) - offsetMs;

  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
    label: `${String(year)} ANNUAL`,
    category: "annual",
  };
}
