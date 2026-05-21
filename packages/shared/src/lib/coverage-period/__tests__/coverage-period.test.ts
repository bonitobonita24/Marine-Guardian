// coverage-period.test.ts — full vitest coverage of the period library.

import { describe, expect, it } from "vitest";
import {
  buildPeriod,
  getAnnualPeriod,
  getLastCompletedWeek,
  getMonthlyPeriod,
  getMonthWeekPeriods,
  getSelectedTemplatePeriod,
  getWeeklyPeriod,
  patrolStartsWithinPeriod,
  DEFAULT_TENANT_OFFSET_MINUTES,
} from "../index";

// Reference offset used throughout: UTC+8 (Mindoro / Banggai).
const UTC8 = DEFAULT_TENANT_OFFSET_MINUTES;

describe("buildPeriod", () => {
  it("constructs a Period with the supplied fields", () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-06-01T00:00:00.000Z");
    const p = buildPeriod(start, end, "MAY 2026", "monthly");
    expect(p.start).toBe(start);
    expect(p.end).toBe(end);
    expect(p.label).toBe("MAY 2026");
    expect(p.category).toBe("monthly");
  });

  it("rejects invalid dates", () => {
    expect(() =>
      buildPeriod(
        new Date("invalid"),
        new Date("2026-06-01T00:00:00.000Z"),
        "x",
        "monthly",
      ),
    ).toThrow(/start must be a valid Date/);
    expect(() =>
      buildPeriod(
        new Date("2026-05-01T00:00:00.000Z"),
        new Date("invalid"),
        "x",
        "monthly",
      ),
    ).toThrow(/end must be a valid Date/);
  });

  it("rejects end <= start", () => {
    const same = new Date("2026-05-01T00:00:00.000Z");
    expect(() => buildPeriod(same, same, "x", "monthly")).toThrow(
      /end must be strictly after start/,
    );
    const earlier = new Date("2026-04-01T00:00:00.000Z");
    const later = new Date("2026-05-01T00:00:00.000Z");
    expect(() => buildPeriod(later, earlier, "x", "monthly")).toThrow(
      /end must be strictly after start/,
    );
  });
});

describe("getMonthlyPeriod", () => {
  it("returns May 2026 at UTC+8", () => {
    const p = getMonthlyPeriod(2026, 5, UTC8);
    // May 1 00:00 PHT = Apr 30 16:00 UTC
    expect(p.start.toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-05-31T16:00:00.000Z");
    expect(p.label).toBe("MAY 2026");
    expect(p.category).toBe("monthly");
  });

  it("returns May 2026 at UTC when offset = 0", () => {
    const p = getMonthlyPeriod(2026, 5, 0);
    expect(p.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("rolls over to next year for December", () => {
    const p = getMonthlyPeriod(2026, 12, UTC8);
    expect(p.start.toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-12-31T16:00:00.000Z");
    expect(p.label).toBe("DECEMBER 2026");
  });

  it("rejects month out of range", () => {
    expect(() => getMonthlyPeriod(2026, 0)).toThrow(/month must be 1..12/);
    expect(() => getMonthlyPeriod(2026, 13)).toThrow(/month must be 1..12/);
  });

  it("rejects non-integer year", () => {
    expect(() => getMonthlyPeriod(2026.5, 5)).toThrow(
      /year must be an integer/,
    );
  });
});

describe("getAnnualPeriod", () => {
  it("returns 2026 ANNUAL at UTC+8", () => {
    const p = getAnnualPeriod(2026, UTC8);
    expect(p.start.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-12-31T16:00:00.000Z");
    expect(p.label).toBe("2026 ANNUAL");
    expect(p.category).toBe("annual");
  });

  it("rejects non-integer year", () => {
    expect(() => getAnnualPeriod(2026.5)).toThrow(/year must be an integer/);
  });
});

describe("getMonthWeekPeriods", () => {
  it("returns 4 weeks for May 2026 at UTC+8 (Mondays May 4, 11, 18, 25)", () => {
    const weeks = getMonthWeekPeriods(2026, 5, UTC8);
    expect(weeks).toHaveLength(4);
    // First week Monday May 4 00:00 PHT = May 3 16:00 UTC
    expect(weeks[0]?.start.toISOString()).toBe("2026-05-03T16:00:00.000Z");
    // End exclusive Monday May 11 00:00 PHT = May 10 16:00 UTC
    expect(weeks[0]?.end.toISOString()).toBe("2026-05-10T16:00:00.000Z");
    // Labels (ISO week 19 starts Mon May 4 2026)
    expect(weeks[0]?.label).toBe("Week 19 (May 4–10, 2026)");
    expect(weeks[1]?.label).toBe("Week 20 (May 11–17, 2026)");
    expect(weeks[2]?.label).toBe("Week 21 (May 18–24, 2026)");
    expect(weeks[3]?.label).toBe("Week 22 (May 25–31, 2026)");
    // Each week is exactly 7 days
    for (const w of weeks) {
      expect(w.end.getTime() - w.start.getTime()).toBe(7 * 86_400_000);
      expect(w.category).toBe("weekly");
    }
  });

  it("returns 5 weeks for August 2026 (Mondays Aug 3, 10, 17, 24, 31)", () => {
    const weeks = getMonthWeekPeriods(2026, 8, UTC8);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.label).toBe("Week 32 (Aug 3–9, 2026)");
    expect(weeks[4]?.label).toBe("Week 36 (Aug 31–Sep 6, 2026)");
  });

  it("returns 4 weeks for February 2026 (non-leap, Mondays Feb 2, 9, 16, 23)", () => {
    const weeks = getMonthWeekPeriods(2026, 2, UTC8);
    expect(weeks).toHaveLength(4);
    expect(weeks[0]?.label).toBe("Week 6 (Feb 2–8, 2026)");
    expect(weeks[3]?.label).toBe("Week 9 (Feb 23–Mar 1, 2026)");
  });

  it("includes the first day when month starts on Monday", () => {
    // June 2026: June 1 is a Monday → first Monday = day 1.
    // Mondays in June 2026: 1, 8, 15, 22, 29 = 5 weeks.
    const weeks = getMonthWeekPeriods(2026, 6, UTC8);
    expect(weeks[0]?.label).toBe("Week 23 (Jun 1–7, 2026)");
    expect(weeks).toHaveLength(5);
    expect(weeks[4]?.label).toBe("Week 27 (Jun 29–Jul 5, 2026)");
  });

  it("rejects bad inputs", () => {
    expect(() => getMonthWeekPeriods(2026, 0)).toThrow(/month must be 1..12/);
    expect(() => getMonthWeekPeriods(2026.5, 5)).toThrow(
      /year must be an integer/,
    );
  });
});

describe("getWeeklyPeriod", () => {
  it("returns Week 19 (May 4–10) as weekIndex 0 of May 2026", () => {
    const p = getWeeklyPeriod(2026, 5, 0, UTC8);
    expect(p.label).toBe("Week 19 (May 4–10, 2026)");
    expect(p.start.toISOString()).toBe("2026-05-03T16:00:00.000Z");
  });

  it("throws when weekIndex out of range", () => {
    expect(() => getWeeklyPeriod(2026, 5, 4, UTC8)).toThrow(/out of range/);
  });

  it("throws on negative weekIndex", () => {
    expect(() => getWeeklyPeriod(2026, 5, -1, UTC8)).toThrow(
      /must be a non-negative integer/,
    );
  });
});

describe("getLastCompletedWeek", () => {
  it("returns Week 20 (May 11–17) when now is Tuesday May 19 2026", () => {
    // Tuesday May 19 2026 12:00 PHT = May 19 04:00 UTC
    const now = new Date("2026-05-19T04:00:00.000Z");
    const p = getLastCompletedWeek(now, UTC8);
    expect(p.label).toBe("Week 20 (May 11–17, 2026)");
    // Start: Monday May 11 00:00 PHT = May 10 16:00 UTC
    expect(p.start.toISOString()).toBe("2026-05-10T16:00:00.000Z");
    // End: Monday May 18 00:00 PHT = May 17 16:00 UTC
    expect(p.end.toISOString()).toBe("2026-05-17T16:00:00.000Z");
  });

  it("returns Week 20 (May 11–17) when now is exactly Monday May 18 00:00 PHT", () => {
    const now = new Date("2026-05-17T16:00:00.000Z");
    const p = getLastCompletedWeek(now, UTC8);
    expect(p.label).toBe("Week 20 (May 11–17, 2026)");
  });

  it("returns Week 19 (May 4–10) when now is Sunday May 17 23:00 PHT", () => {
    // Sun May 17 23:00 PHT = May 17 15:00 UTC (still inside Week 20)
    const now = new Date("2026-05-17T15:00:00.000Z");
    const p = getLastCompletedWeek(now, UTC8);
    expect(p.label).toBe("Week 19 (May 4–10, 2026)");
  });

  it("rejects invalid now", () => {
    expect(() => getLastCompletedWeek(new Date("nope"))).toThrow(
      /must be a valid Date/,
    );
  });
});

describe("patrolStartsWithinPeriod", () => {
  const may = getMonthlyPeriod(2026, 5, UTC8);

  it("includes patrol that started inside the period", () => {
    expect(
      patrolStartsWithinPeriod(
        { startTime: new Date("2026-05-15T03:00:00.000Z") },
        may,
      ),
    ).toBe(true);
  });

  it("includes patrol that started exactly at period.start", () => {
    expect(patrolStartsWithinPeriod({ startTime: may.start }, may)).toBe(true);
  });

  it("excludes patrol that started exactly at period.end (half-open)", () => {
    expect(patrolStartsWithinPeriod({ startTime: may.end }, may)).toBe(false);
  });

  it("excludes patrol whose startTime is null", () => {
    expect(patrolStartsWithinPeriod({ startTime: null }, may)).toBe(false);
  });

  it("excludes patrol that started before the period", () => {
    expect(
      patrolStartsWithinPeriod(
        { startTime: new Date("2026-04-15T03:00:00.000Z") },
        may,
      ),
    ).toBe(false);
  });
});

describe("getSelectedTemplatePeriod", () => {
  const fixedNow = new Date("2026-05-19T04:00:00.000Z"); // Tue May 19 12:00 PHT

  it("defaults to monthly + current tenant month when no input given", () => {
    const p = getSelectedTemplatePeriod({}, fixedNow, UTC8);
    expect(p.category).toBe("monthly");
    expect(p.label).toBe("MAY 2026");
  });

  it("returns the requested monthly period", () => {
    const p = getSelectedTemplatePeriod(
      { category: "monthly", year: 2026, month: 3 },
      fixedNow,
      UTC8,
    );
    expect(p.label).toBe("MARCH 2026");
  });

  it("returns the requested annual period", () => {
    const p = getSelectedTemplatePeriod(
      { category: "annual", year: 2025 },
      fixedNow,
      UTC8,
    );
    expect(p.label).toBe("2025 ANNUAL");
  });

  it("returns last completed week when category=weekly without indices", () => {
    const p = getSelectedTemplatePeriod(
      { category: "weekly" },
      fixedNow,
      UTC8,
    );
    expect(p.label).toBe("Week 20 (May 11–17, 2026)");
  });

  it("returns the requested weekly period when indices supplied", () => {
    const p = getSelectedTemplatePeriod(
      { category: "weekly", year: 2026, month: 5, weekIndex: 2 },
      fixedNow,
      UTC8,
    );
    expect(p.label).toBe("Week 21 (May 18–24, 2026)");
  });

  it("annual default uses current year when no year given", () => {
    const p = getSelectedTemplatePeriod(
      { category: "annual" },
      fixedNow,
      UTC8,
    );
    expect(p.label).toBe("2026 ANNUAL");
  });
});
