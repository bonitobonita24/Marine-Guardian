import { describe, it, expect } from "vitest";
import { colorForEventType } from "../event-type-color";
import { EVENT_TYPE_ORDER } from "../event-type-order";

const LAW = "law-enforcement-and-apprehensions";
const MON = "monitoring_patrolling_and_surveillance";

describe("colorForEventType", () => {
  it("returns a distinct hex accent for every one of the 11 canonical sub-types", () => {
    const labels = [...EVENT_TYPE_ORDER.law_enforcement, ...EVENT_TYPE_ORDER.monitoring];
    const colors = labels.map((l) => colorForEventType(l, null));
    // all resolved to a real hex (not the neutral fallback)
    for (const c of colors) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(colors).not.toContain("#64748b");
    // all distinct
    expect(new Set(colors).size).toBe(labels.length);
  });

  it("matches tolerantly (parenthetical / case / punctuation)", () => {
    expect(colorForEventType("fishing in a prohibited area")).toBe(
      colorForEventType("Fishing in a prohibited area (MPA)"),
    );
    expect(colorForEventType("Fishing in a prohibited area (MPA)")).toBe("#f97316");
  });

  it("gives the 'Others' aggregate a neutral slate distinct from every real type accent", () => {
    const labels = [...EVENT_TYPE_ORDER.law_enforcement, ...EVENT_TYPE_ORDER.monitoring];
    const typeColors = new Set(labels.map((l) => colorForEventType(l, null)));
    // "Others" (and any unlisted type) → slate, regardless of category — never
    // duplicates a canonical type's colour (the old red-collision bug).
    expect(colorForEventType("Others", LAW)).toBe("#64748b");
    expect(colorForEventType("Others", MON)).toBe("#64748b");
    expect(typeColors.has("#64748b")).toBe(false);
  });

  it("falls back to neutral slate for an unlisted type or no type", () => {
    expect(colorForEventType("Some New ER Type", LAW)).toBe("#64748b");
    expect(colorForEventType(null, null)).toBe("#64748b");
    expect(colorForEventType(undefined, "analyzer_event")).toBe("#64748b");
  });
});
