/**
 * Adaptive time-series bucketing for the "Events vs Patrols Over Time" line
 * chart on the Interactive Report Map (2026-07-06).
 *
 * A fixed daily bucket produces ~400 noisy points on a multi-month range and
 * its x-axis labels stop lining up with anything meaningful. Instead we pick
 * a granularity by the requested span:
 *   rangeDays > 183 (>~6 months) → month buckets, label "MMM yyyy"
 *   rangeDays > 31  (>~1 month)  → week buckets (ISO week, Monday start), label "MMM d" of the week start
 *   else (<=31 days)             → day buckets (unchanged behaviour), label "MMM d"
 *
 * All keys/labels are computed in LOCAL time (no UTC shift) — matching the
 * existing `dayKey`/`shortDay` local-calendar approach elsewhere in this
 * router / the chart component.
 */

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type TimeSeriesGranularity = "day" | "week" | "month";

export interface EventsPatrolsSeriesPoint {
  /** Sortable bucket key: `yyyy-MM-dd` (day/week-start) or `yyyy-MM` (month). */
  date: string;
  /** Pre-formatted display label per the granularity rules above. */
  label: string;
  count: number;
  patrolCount: number;
}

/** Whole days between two local-calendar dates (ignoring time-of-day). */
export function rangeDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Picks bucket granularity from the requested range span (in whole days). */
export function granularityForRangeDays(rangeDays: number): TimeSeriesGranularity {
  if (rangeDays > 183) return "month";
  if (rangeDays > 31) return "week";
  return "day";
}

/** Local-calendar `yyyy-MM-dd` key (no timezone shift). */
function dayKeyLocal(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local-calendar `yyyy-MM` key (no timezone shift). */
function monthKeyLocal(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** The Monday (local calendar) that starts `d`'s ISO week. */
function weekStartLocal(d: Date): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = local.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + diffToMonday);
  return local;
}

/** `"MMM d"` label, e.g. "Jan 15". */
function dayLabel(d: Date): string {
  const month: string = MONTH_ABBR[d.getMonth()] ?? "";
  const day: string = String(d.getDate());
  return `${month} ${day}`;
}

/** `"MMM yyyy"` label, e.g. "Jan 2026". */
function monthLabel(d: Date): string {
  const month: string = MONTH_ABBR[d.getMonth()] ?? "";
  const year: string = String(d.getFullYear());
  return `${month} ${year}`;
}

/**
 * A very high sanity bound only — guards against a runaway loop on malformed
 * input, never truncates a legitimate range (a multi-year range at monthly
 * granularity is a few dozen points; at daily it's a few thousand at most).
 */
const MAX_BUCKETS = 5000;

/**
 * Builds a continuous, zero-filled, ascending {date,label,count,patrolCount}
 * series for the Events vs Patrols Over Time chart, bucketed adaptively by
 * the [from, to] span (see module doc for thresholds).
 *
 * `eventDates`/`patrolDates` are expected to already be scoped to [from, to]
 * by the caller's Prisma where-clause — this function only buckets + fills.
 */
export function buildEventsPatrolsSeries(
  eventDates: Date[],
  patrolDates: Date[],
  from: Date,
  to: Date,
): EventsPatrolsSeriesPoint[] {
  const rangeDays = rangeDaysBetween(from, to);
  const granularity = granularityForRangeDays(rangeDays);

  const keyOf = (d: Date): string => {
    if (granularity === "month") return monthKeyLocal(d);
    if (granularity === "week") return dayKeyLocal(weekStartLocal(d));
    return dayKeyLocal(d);
  };

  const counts: Record<string, number> = {};
  for (const d of eventDates) {
    const key = keyOf(d);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const patrolCounts: Record<string, number> = {};
  for (const d of patrolDates) {
    const key = keyOf(d);
    patrolCounts[key] = (patrolCounts[key] ?? 0) + 1;
  }

  const series: EventsPatrolsSeriesPoint[] = [];
  const push = (bucketStart: Date, key: string, label: string) => {
    series.push({
      date: key,
      label,
      count: counts[key] ?? 0,
      patrolCount: patrolCounts[key] ?? 0,
    });
  };

  if (granularity === "month") {
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < MAX_BUCKETS) {
      push(cursor, monthKeyLocal(cursor), monthLabel(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }
  } else if (granularity === "week") {
    const cursor = weekStartLocal(from);
    const end = weekStartLocal(to);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < MAX_BUCKETS) {
      push(cursor, dayKeyLocal(cursor), dayLabel(cursor));
      cursor.setDate(cursor.getDate() + 7);
      guard += 1;
    }
  } else {
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < MAX_BUCKETS) {
      push(cursor, dayKeyLocal(cursor), dayLabel(cursor));
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  return series;
}

/** `"MMM d"` label for a `yyyy-MM-dd` day key (no timezone shift). Used by the
 * no-bounds fallback branch to keep the series shape uniform. */
export function dayKeyToLabel(key: string): string {
  const parts = key.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return key;
  return dayLabel(new Date(y, m - 1, d));
}
