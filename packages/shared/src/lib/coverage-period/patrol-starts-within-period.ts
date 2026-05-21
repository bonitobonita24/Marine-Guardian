// patrol-starts-within-period.ts — v2 spec function from L218.
//
// Predicate: does this patrol's start time fall within the period's
// half-open [start, end) interval? Returns false when startTime is null
// (patrol has never been started — should not appear in any period's report).

import type { PatrolForPeriod, Period } from "./types";

export function patrolStartsWithinPeriod(
  patrol: PatrolForPeriod,
  period: Period,
): boolean {
  if (patrol.startTime === null) return false;
  const t = patrol.startTime.getTime();
  return t >= period.start.getTime() && t < period.end.getTime();
}
