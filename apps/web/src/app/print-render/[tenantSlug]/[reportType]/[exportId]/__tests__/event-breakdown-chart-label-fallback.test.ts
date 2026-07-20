import { describe, it, expect } from "vitest";
import {
  buildChartRows,
  humanizeEventTypeKey,
  resolveRowLabel,
} from "../components/event-breakdown-chart";
import type { EventTypeBreakdownRow } from "@/server/per-area-report/get-per-area-report-data";

/**
 * A bar row must NEVER render a blank label (owner 2026-07-20). The chart falls
 * through display → humanized raw key → canonical slot label → "Unknown", so a
 * row whose ER display name is missing/empty still prints something readable.
 */

function row(
  display: string,
  count: number,
  value = display,
): EventTypeBreakdownRow {
  return { eventTypeId: value, value, display, count };
}

describe("humanizeEventTypeKey — raw-key fallback", () => {
  it("turns a snake_case ER key into title-cased words", () => {
    expect(humanizeEventTypeKey("compressor_fishing")).toBe("Compressor Fishing");
  });

  it("handles kebab-case, dots, and collapses repeated separators", () => {
    expect(humanizeEventTypeKey("use-of__prohibited.gears")).toBe(
      "Use Of Prohibited Gears",
    );
  });

  it("returns an empty string for a key with no readable content", () => {
    expect(humanizeEventTypeKey("   ")).toBe("");
    expect(humanizeEventTypeKey("___")).toBe("");
  });
});

describe("resolveRowLabel — fallback chain", () => {
  it("prefers a real display name", () => {
    expect(
      resolveRowLabel({ display: "Compressor Fishing", value: "cf" }, "Canon"),
    ).toBe("Compressor Fishing");
  });

  it("falls back to the humanized raw key when display is empty", () => {
    expect(
      resolveRowLabel({ display: "   ", value: "destructive_practices" }, "Canon"),
    ).toBe("Destructive Practices");
  });

  it("falls back to the humanized raw key when display is null", () => {
    expect(resolveRowLabel({ display: null, value: "some_key" }, "Canon")).toBe(
      "Some Key",
    );
  });

  it("falls back to the canonical label when display and value are both unusable", () => {
    expect(resolveRowLabel({ display: "", value: "" }, "Compressor Fishing")).toBe(
      "Compressor Fishing",
    );
  });

  it("falls back to 'Unknown' when nothing at all resolves", () => {
    expect(resolveRowLabel({ display: null, value: null }, "")).toBe("Unknown");
    expect(resolveRowLabel(undefined, "")).toBe("Unknown");
  });
});

describe("buildChartRows — no row ever renders a blank label", () => {
  it("a row with an empty display still gets a readable label from its raw key", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("", 12, "compressor_fishing"),
      row("Unregistered Illegal Fishing", 3),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 10);
    const compressor = out.find((r) => r.name === "Compressor Fishing");
    expect(compressor).toBeDefined();
    // Resolved via the raw key, so it matches its canonical slot and keeps its count.
    expect(compressor?.count).toBe(12);
    expect(out.every((r) => r.name.trim().length > 0)).toBe(true);
  });

  it("a null-display row with no usable key still falls back to the canonical label", () => {
    const rows: EventTypeBreakdownRow[] = [
      { eventTypeId: "x", value: "", display: "", count: 0 },
      row("Destructive Practices", 4),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 10);
    expect(out.every((r) => r.name.trim().length > 0)).toBe(true);
    expect(out.map((r) => r.name)).toContain("Destructive Practices");
  });

  it("a non-canonical extra with an empty display humanizes its raw key", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("", 9, "others_misc"),
      row("Compressor Fishing", 1),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 10);
    // Not a canonical type → appended after the fixed sequence, label humanized.
    expect(out.at(-1)).toEqual(
      expect.objectContaining({ name: "Others Misc", count: 9 }),
    );
    expect(out.every((r) => r.name.trim().length > 0)).toBe(true);
  });

  it("existing labeled rows are unchanged — canonical order and displays preserved", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("Compressor Fishing", 8),
      row("Unregistered Illegal Fishing", 1),
      row("Destructive Practices", 50),
      row("Use of Prohibited Gears", 3),
      row("Fishing in a prohibited area (MPA)", 7),
      row("Taking of Prohibited Species", 2),
    ];
    expect(buildChartRows(rows, "lawEnforcement", 10).map((r) => r.name)).toEqual([
      "Unregistered Illegal Fishing",
      "Fishing in a prohibited area (MPA)",
      "Taking of Prohibited Species",
      "Use of Prohibited Gears",
      "Compressor Fishing",
      "Destructive Practices",
    ]);
  });

  it("preserves the count-desc tiebreak for non-canonical extras", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("Others", 2),
      row("Zebra Extra", 30),
      row("Alpha Extra", 30),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 20).map((r) => r.name);
    const extras = out.slice(6);
    // count desc, then label ascending for the 30/30 tie.
    expect(extras).toEqual(["Alpha Extra", "Zebra Extra", "Others"]);
  });
});
