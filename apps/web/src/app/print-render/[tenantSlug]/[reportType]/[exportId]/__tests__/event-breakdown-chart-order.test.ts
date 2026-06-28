import { describe, it, expect } from "vitest";
import { buildChartRows } from "../components/event-breakdown-chart";
import type { EventTypeBreakdownRow } from "@/server/per-area-report/get-per-area-report-data";

function row(display: string, count: number): EventTypeBreakdownRow {
  return { eventTypeId: display, value: display, display, count };
}

describe("buildChartRows — canonical event-type order (PDF report)", () => {
  it("law enforcement: renders the fixed owner sequence regardless of count", () => {
    // Shuffled + count-inverted so a count-desc sort would reorder it.
    const rows: EventTypeBreakdownRow[] = [
      row("Compressor Fishing", 8),
      row("Unregistered Illegal Fishing", 1),
      row("Destructive Practices", 50),
      row("Use of Prohibited Gears", 3),
      row("Fishing in a prohibited area (MPA)", 7),
      row("Taking of Prohibited Species", 2),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 10).map((r) => r.name);
    expect(out).toEqual([
      "Unregistered Illegal Fishing",
      "Fishing in a prohibited area (MPA)",
      "Taking of Prohibited Species",
      "Use of Prohibited Gears",
      "Compressor Fishing",
      "Destructive Practices",
    ]);
  });

  it("monitoring: canonical order, matching tolerant of case/punctuation", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("threats on habitat", 99),
      row("Marine wildlife sightings", 1),
      row("Community Support", 5),
    ];
    const out = buildChartRows(rows, "monitoring", 10).map((r) => r.name);
    expect(out).toEqual([
      "Marine wildlife sightings",
      "Community Support",
      "threats on habitat",
    ]);
  });

  it("unlisted types sort after canonical ones, by count desc then display asc", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("Zulu Unknown Type", 3),
      row("Alpha Unknown Type", 3),
      row("Unregistered Illegal Fishing", 1),
      row("Beta Unknown Type", 9),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 10).map((r) => r.name);
    expect(out).toEqual([
      "Unregistered Illegal Fishing", // canonical first, even at count 1
      "Beta Unknown Type", // unlisted: count 9
      "Alpha Unknown Type", // unlisted: count 3, display asc tiebreak
      "Zulu Unknown Type", // unlisted: count 3
    ]);
  });

  it("drops zero-count types and respects topN", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("Unregistered Illegal Fishing", 0), // dropped
      row("Taking of Prohibited Species", 4),
      row("Use of Prohibited Gears", 2),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 1).map((r) => r.name);
    expect(out).toEqual(["Taking of Prohibited Species"]);
  });
});
