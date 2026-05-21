// coverage-period/types.ts
//
// v2 PRODUCT.md L210-L213 period selector spec. Used by the Coverage Report
// (Reports — Patrol Coverage Template) to slice patrols into Weekly / Monthly /
// Annual windows.
//
// Semantics:
//   - All Period intervals are HALF-OPEN: [start, end). End is exclusive — it
//     equals the start of the next period. This matches the
//     patrolStartsWithinPeriod() predicate (p.startTime >= start && < end)
//     and avoids off-by-one duplication at boundary instants.
//   - All Dates are JavaScript Date objects (instants — wall-clock-agnostic).
//   - Periods are computed in UTC by default. A tenant timezone offset (in
//     minutes east of UTC, e.g. +480 for Philippines/Indonesia UTC+8) shifts
//     the boundaries so that "May 2026" means May 1 00:00 tenant-local through
//     June 1 00:00 tenant-local — represented internally as the corresponding
//     UTC instants.
//   - DST audit is deferred per v2 PRODUCT.md L626. Both v2 tenants (Mindoro,
//     Banggai) are fixed-offset UTC+8. When the first DST-observing tenant
//     onboards, every function in this folder needs a re-audit (see spec).

export type PeriodCategory = "weekly" | "monthly" | "annual";

export interface Period {
  start: Date;
  end: Date;
  label: string;
  category: PeriodCategory;
}

/**
 * Subset of Prisma Patrol used by patrolStartsWithinPeriod(). Keeps this
 * library zero-dep on packages/db — anything with a nullable startTime
 * satisfies the interface.
 */
export interface PatrolForPeriod {
  startTime: Date | null;
}

/**
 * Default tenant timezone offset for v2 launch tenants (Mindoro, Banggai).
 * Both are UTC+8, no DST. Exported so callers can use it explicitly rather
 * than hardcoding 480 at call sites.
 */
export const DEFAULT_TENANT_OFFSET_MINUTES = 480;
