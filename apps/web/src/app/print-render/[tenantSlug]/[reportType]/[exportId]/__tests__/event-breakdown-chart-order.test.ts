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

  it("monitoring: EVERY canonical type in order, including zero-count ones (owner 2026-07-12)", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("threats on habitat", 99),
      row("Marine wildlife sightings", 1),
      row("Community Support", 5),
    ];
    const out = buildChartRows(rows, "monitoring", 10);
    // All 5 canonical monitoring types appear in the fixed order — the two absent
    // from the data (Infrastructure, Research) render with count 0. A present
    // type keeps the data's display string ("threats on habitat").
    expect(out.map((r) => r.name)).toEqual([
      "Marine wildlife sightings",
      "Infrastructure and assets",
      "Research and Studies",
      "Community Support",
      "threats on habitat",
    ]);
    expect(out.map((r) => r.count)).toEqual([1, 0, 0, 5, 99]);
  });

  it("shows all canonical types first, then unlisted buckets by count desc then display asc", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("Zulu Unknown Type", 3),
      row("Alpha Unknown Type", 3),
      row("Unregistered Illegal Fishing", 1),
      row("Beta Unknown Type", 9),
    ];
    const out = buildChartRows(rows, "lawEnforcement", 10).map((r) => r.name);
    expect(out).toEqual([
      // all 6 canonical law types, in canonical order (5 of them at count 0)
      "Unregistered Illegal Fishing",
      "Fishing in a prohibited area (MPA)",
      "Taking of Prohibited Species",
      "Use of Prohibited Gears",
      "Compressor Fishing",
      "Destructive Practices",
      // then the unlisted buckets, count desc → display asc
      "Beta Unknown Type",
      "Alpha Unknown Type",
      "Zulu Unknown Type",
    ]);
  });

  it("keeps zero-count canonical types in canonical order and respects topN", () => {
    const rows: EventTypeBreakdownRow[] = [
      row("Unregistered Illegal Fishing", 0), // shown (owner: no longer dropped)
      row("Taking of Prohibited Species", 4),
      row("Use of Prohibited Gears", 2),
    ];
    // topN caps the (canonical-ordered) list — the FIRST canonical type wins,
    // even at count 0.
    expect(buildChartRows(rows, "lawEnforcement", 1).map((r) => r.name)).toEqual([
      "Unregistered Illegal Fishing",
    ]);
    // topN high enough → all 6 canonical, in order, zero-count included.
    const full = buildChartRows(rows, "lawEnforcement", 10);
    expect(full).toHaveLength(6);
    expect(full[0]).toMatchObject({ name: "Unregistered Illegal Fishing", count: 0 });
    expect(full[2]).toMatchObject({ name: "Taking of Prohibited Species", count: 4 });
  });
});
