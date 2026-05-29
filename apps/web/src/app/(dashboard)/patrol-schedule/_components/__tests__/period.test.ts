import { describe, it, expect } from "vitest";
import {
  buildPeriod,
  stepPeriod,
  formatPeriodLabel,
} from "../period";

describe("buildPeriod", () => {
  it("biweekly: anchor mid-day → from at UTC midnight, to +14 days", () => {
    const anchor = new Date("2026-03-10T15:00:00Z");
    const p = buildPeriod(anchor, "biweekly");
    expect(p.view).toBe("biweekly");
    expect(p.from.toISOString()).toBe("2026-03-10T00:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-03-24T00:00:00.000Z");
  });

  it("monthly: anchor mid-day → from first of month, to first of next month", () => {
    const anchor = new Date("2026-03-10T15:00:00Z");
    const p = buildPeriod(anchor, "monthly");
    expect(p.view).toBe("monthly");
    expect(p.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("monthly: anchor at last moment of month → same March window", () => {
    const anchor = new Date("2026-03-31T23:59:00Z");
    const p = buildPeriod(anchor, "monthly");
    expect(p.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("stepPeriod", () => {
  it("biweekly +1: 2026-03-10..03-24 → 2026-03-24..04-07", () => {
    const base = buildPeriod(new Date("2026-03-10T00:00:00Z"), "biweekly");
    const next = stepPeriod(base, 1);
    expect(next.view).toBe("biweekly");
    expect(next.from.toISOString()).toBe("2026-03-24T00:00:00.000Z");
    expect(next.to.toISOString()).toBe("2026-04-07T00:00:00.000Z");
  });

  it("biweekly -1: 2026-03-10..03-24 → 2026-02-24..03-10", () => {
    const base = buildPeriod(new Date("2026-03-10T00:00:00Z"), "biweekly");
    const prev = stepPeriod(base, -1);
    expect(prev.view).toBe("biweekly");
    expect(prev.from.toISOString()).toBe("2026-02-24T00:00:00.000Z");
    expect(prev.to.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("monthly +1: March 2026 → April 2026", () => {
    const base = buildPeriod(new Date("2026-03-01T00:00:00Z"), "monthly");
    const next = stepPeriod(base, 1);
    expect(next.view).toBe("monthly");
    expect(next.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(next.to.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("monthly -1 across year: January 2026 → December 2025", () => {
    const base = buildPeriod(new Date("2026-01-01T00:00:00Z"), "monthly");
    const prev = stepPeriod(base, -1);
    expect(prev.view).toBe("monthly");
    expect(prev.from.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(prev.to.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("view preserved: biweekly stays biweekly after step", () => {
    const base = buildPeriod(new Date("2026-03-10T00:00:00Z"), "biweekly");
    expect(stepPeriod(base, 1).view).toBe("biweekly");
    expect(stepPeriod(base, -1).view).toBe("biweekly");
  });

  it("view preserved: monthly stays monthly after step", () => {
    const base = buildPeriod(new Date("2026-03-01T00:00:00Z"), "monthly");
    expect(stepPeriod(base, 1).view).toBe("monthly");
    expect(stepPeriod(base, -1).view).toBe("monthly");
  });
});

describe("formatPeriodLabel", () => {
  it("biweekly: 2026-03-03..03-17 → 'Mar 3 – Mar 16, 2026'", () => {
    const p = buildPeriod(new Date("2026-03-03T00:00:00Z"), "biweekly");
    // from=2026-03-03, to=2026-03-17, inclusive end=2026-03-16
    expect(formatPeriodLabel(p)).toBe("Mar 3 – Mar 16, 2026");
  });

  it("monthly: March 2026 → 'March 2026'", () => {
    const p = buildPeriod(new Date("2026-03-01T00:00:00Z"), "monthly");
    expect(formatPeriodLabel(p)).toBe("March 2026");
  });
});
