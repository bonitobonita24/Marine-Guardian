import { describe, it, expect } from "vitest";
import {
  buildEventsPatrolsSeries,
  dayKeyToLabel,
  granularityForRangeDays,
  rangeDaysBetween,
} from "../time-series-bucketing";

describe("granularityForRangeDays", () => {
  it("picks month for >183 days, week for >31 (<=183), day otherwise", () => {
    expect(granularityForRangeDays(200)).toBe("month");
    expect(granularityForRangeDays(184)).toBe("month");
    expect(granularityForRangeDays(183)).toBe("week");
    expect(granularityForRangeDays(60)).toBe("week");
    expect(granularityForRangeDays(32)).toBe("week");
    expect(granularityForRangeDays(31)).toBe("day");
    expect(granularityForRangeDays(10)).toBe("day");
    expect(granularityForRangeDays(0)).toBe("day");
  });
});

describe("buildEventsPatrolsSeries", () => {
  it("(a) buckets monthly with 'MMM yyyy' labels, one continuous point per month, for a >183-day range", () => {
    const from = new Date(2026, 0, 1); // Jan 1 2026
    const to = new Date(2026, 6, 6); // Jul 6 2026 (~187 days)
    expect(rangeDaysBetween(from, to)).toBeGreaterThan(183);

    const events = [
      new Date(2026, 0, 15),
      new Date(2026, 2, 3),
      new Date(2026, 2, 20),
    ];
    const patrols = [new Date(2026, 5, 1)];

    const series = buildEventsPatrolsSeries(events, patrols, from, to);

    expect(series.map((p) => p.date)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
    expect(series.map((p) => p.label)).toEqual([
      "Jan 2026",
      "Feb 2026",
      "Mar 2026",
      "Apr 2026",
      "May 2026",
      "Jun 2026",
      "Jul 2026",
    ]);
    expect(series.find((p) => p.date === "2026-03")?.count).toBe(2);
    expect(series.find((p) => p.date === "2026-01")?.count).toBe(1);
    expect(series.find((p) => p.date === "2026-06")?.patrolCount).toBe(1);
  });

  it("(b) buckets weekly (fewer points than daily would give) for a >31-day, <=6-month range", () => {
    const from = new Date(2026, 3, 1); // Apr 1 2026
    const to = new Date(2026, 4, 30); // May 30 2026 (~59 days)
    expect(rangeDaysBetween(from, to)).toBeGreaterThan(31);
    expect(rangeDaysBetween(from, to)).toBeLessThanOrEqual(183);

    const events = [new Date(2026, 3, 6)]; // Mon Apr 6
    const patrols: Date[] = [];

    const series = buildEventsPatrolsSeries(events, patrols, from, to);

    // Daily would be ~60 points; weekly should be well under that.
    expect(series.length).toBeLessThan(15);
    expect(series.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))).toBe(true);
    // Ascending
    const keys = series.map((p) => p.date);
    expect(keys).toEqual([...keys].sort());
    // The event on Apr 6 (a Monday) buckets into the week starting Apr 6.
    expect(series.find((p) => p.date === "2026-04-06")?.count).toBe(1);
  });

  it("(c) buckets daily for a <=31-day range", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 10);
    expect(rangeDaysBetween(from, to)).toBeLessThanOrEqual(31);

    const events = [new Date(2026, 5, 3), new Date(2026, 5, 3)];
    const patrols = [new Date(2026, 5, 5)];

    const series = buildEventsPatrolsSeries(events, patrols, from, to);

    expect(series.length).toBe(10);
    expect(series[0]?.date).toBe("2026-06-01");
    expect(series[series.length - 1]?.date).toBe("2026-06-10");
    expect(series.find((p) => p.date === "2026-06-03")).toEqual({
      date: "2026-06-03",
      label: "Jun 3",
      count: 2,
      patrolCount: 0,
    });
    expect(series.find((p) => p.date === "2026-06-05")?.patrolCount).toBe(1);
  });

  it("(d) totals: sum of count/patrolCount equal the number of input dates in range", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 5);
    const events = [
      new Date(2026, 5, 1),
      new Date(2026, 5, 1),
      new Date(2026, 5, 4),
    ];
    const patrols = [new Date(2026, 5, 2)];

    const series = buildEventsPatrolsSeries(events, patrols, from, to);

    expect(series.reduce((s, p) => s + p.count, 0)).toBe(events.length);
    expect(series.reduce((s, p) => s + p.patrolCount, 0)).toBe(patrols.length);
  });

  it("(e) zero-fills empty buckets and returns an ascending continuous series", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 5);
    const events = [new Date(2026, 5, 1)];
    const patrols: Date[] = [];

    const series = buildEventsPatrolsSeries(events, patrols, from, to);

    expect(series.length).toBe(5);
    const keys = series.map((p) => p.date);
    expect(keys).toEqual([...keys].sort());
    expect(series.find((p) => p.date === "2026-06-03")).toEqual({
      date: "2026-06-03",
      label: "Jun 3",
      count: 0,
      patrolCount: 0,
    });
  });
});

describe("dayKeyToLabel", () => {
  it("formats a yyyy-MM-dd key as 'MMM d'", () => {
    expect(dayKeyToLabel("2026-01-05")).toBe("Jan 5");
    expect(dayKeyToLabel("2026-12-31")).toBe("Dec 31");
  });
});
