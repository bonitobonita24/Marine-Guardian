// iso-week.ts — internal helper for ISO 8601 week numbering.
//
// ISO 8601: weeks start Monday. Week 1 of a year is the week containing the
// first Thursday (equivalently, the week containing Jan 4). Week year can
// differ from calendar year at boundaries (Dec 31 may be in Week 1 of the
// next year; Jan 1 may be in Week 52/53 of the previous year).
//
// This helper takes a Date already shifted to tenant-local wall-clock time
// (i.e. .getUTC* methods return the tenant-local components). Internal to
// coverage-period — not re-exported.

export interface IsoWeek {
  weekYear: number;
  weekNumber: number;
}

export function getIsoWeek(date: Date): IsoWeek {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Move to nearest Thursday (Mon=1 ... Sun=7).
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const weekYear = d.getUTCFullYear();
  const yearStart = Date.UTC(weekYear, 0, 1);
  const weekNumber = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { weekYear, weekNumber };
}

export const MONTH_LABELS_SHORT = [
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
];
