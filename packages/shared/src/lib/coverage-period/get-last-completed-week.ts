// get-last-completed-week.ts — v2 spec function from L210 + L218.
//
// The most recent ISO week whose Sunday (end) has already passed in tenant-
// local time. Used as the UI default for the weekly period selector.
//
// Algorithm:
//   1. Convert `now` (UTC instant) to tenant-local wall-clock.
//   2. Find the Monday 00:00 tenant-local of "this week" (the week containing
//      `now`).
//   3. Subtract 7 days — that's the Monday of last completed week.
//   4. End of last completed week (exclusive) = "this week's Monday" 00:00.
//
// When `now` happens to land exactly on a Monday at 00:00 tenant-local, the
// week starting on that instant is "this week" (still in progress for 1 ms),
// so last completed = the 7 days ending on that Monday 00:00. This is the
// expected funder semantics — "Week ending Sunday 23:59" is the last completed.

import type { Period } from "./types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "./types";
import { buildWeeklyPeriodFromMonday } from "./build-weekly-period";

export function getLastCompletedWeek(
  now: Date = new Date(),
  offsetMinutes: number = DEFAULT_TENANT_OFFSET_MINUTES,
): Period {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("getLastCompletedWeek: now must be a valid Date");
  }
  const offsetMs = offsetMinutes * 60_000;
  const nowLocal = new Date(now.getTime() + offsetMs);
  const localY = nowLocal.getUTCFullYear();
  const localM = nowLocal.getUTCMonth();
  const localD = nowLocal.getUTCDate();
  const dayNum = nowLocal.getUTCDay() === 0 ? 7 : nowLocal.getUTCDay();
  const daysFromMonday = dayNum - 1;
  // Tenant-local midnight of this-week Monday → UTC ms
  const thisMondayUtcMs =
    Date.UTC(localY, localM, localD - daysFromMonday) - offsetMs;
  const lastMondayUtcMs = thisMondayUtcMs - 7 * 86_400_000;
  return buildWeeklyPeriodFromMonday(lastMondayUtcMs, offsetMinutes);
}
