import { describe, it, expect } from "vitest";
import {
  EVENT_CATEGORY,
  eventCategoryColor,
  eventCategoryHeatHsl,
  eventPrioritySizePx,
  eventPriorityLabel,
} from "../eventMarkerStyle";

describe("eventCategoryColor", () => {
  it("returns chart-1 for law enforcement (matches legend swatch)", () => {
    expect(eventCategoryColor(EVENT_CATEGORY.lawEnforcement)).toBe(
      "hsl(var(--chart-1))",
    );
  });
  it("returns chart-2 for monitoring (matches legend swatch)", () => {
    expect(eventCategoryColor(EVENT_CATEGORY.monitoring)).toBe(
      "hsl(var(--chart-2))",
    );
  });
  it("falls back to muted-foreground for unknown/null category", () => {
    expect(eventCategoryColor(null)).toBe("hsl(var(--muted-foreground))");
    expect(eventCategoryColor(undefined)).toBe("hsl(var(--muted-foreground))");
    expect(eventCategoryColor("analyzer_event")).toBe(
      "hsl(var(--muted-foreground))",
    );
  });
});

describe("eventPrioritySizePx", () => {
  it("scales by priority tier", () => {
    expect(eventPrioritySizePx(0)).toBe(7);
    expect(eventPrioritySizePx(100)).toBe(9);
    expect(eventPrioritySizePx(200)).toBe(11);
    expect(eventPrioritySizePx(300)).toBe(13);
  });
  it("treats out-of-band high values as critical", () => {
    expect(eventPrioritySizePx(500)).toBe(13);
  });
});

describe("eventPriorityLabel", () => {
  it("maps each tier", () => {
    expect(eventPriorityLabel(0)).toBe("Low");
    expect(eventPriorityLabel(100)).toBe("Medium");
    expect(eventPriorityLabel(200)).toBe("High");
    expect(eventPriorityLabel(300)).toBe("Critical");
  });
});

describe("eventCategoryHeatHsl", () => {
  it("returns the --chart-1 triple for law enforcement (matches the dot markers)", () => {
    expect(eventCategoryHeatHsl(EVENT_CATEGORY.lawEnforcement)).toEqual({
      h: 220,
      s: 70,
      l: 50,
    });
  });
  it("returns the --chart-2 triple for monitoring", () => {
    expect(eventCategoryHeatHsl(EVENT_CATEGORY.monitoring)).toEqual({
      h: 160,
      s: 60,
      l: 45,
    });
  });
  it("falls back to a muted triple for unknown/null category", () => {
    expect(eventCategoryHeatHsl(null)).toEqual({ h: 220, s: 10, l: 50 });
    expect(eventCategoryHeatHsl("observation")).toEqual({ h: 220, s: 10, l: 50 });
  });
});
