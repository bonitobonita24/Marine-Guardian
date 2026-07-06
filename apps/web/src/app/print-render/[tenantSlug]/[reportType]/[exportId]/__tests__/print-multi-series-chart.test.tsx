// print-multi-series-chart.test.tsx
//
// Unit tests for the combined "Patrols Over Time by Type" chart (R7,
// 2026-07-06). Two aspects are testable without a real DOM chart layout:
//   1. mergeSeries() — the pure data-merge that unions time buckets across
//      series and zero-fills gaps (this is where correctness lives).
//   2. The empty-state + sr-only alt table markup via renderToStaticMarkup —
//      Recharts' ResponsiveContainer renders nothing measurable under
//      jsdom/renderToStaticMarkup (0x0), so we assert the surrounding
//      print-safe scaffolding rather than SVG paths, matching how the other
//      print-render chart tests treat Recharts.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  mergeSeries,
  PrintMultiSeriesChart,
} from "../components/print-multi-series-chart";
import type { ReportMapTimeSeriesPoint } from "@/server/report-map-report/get-report-map-report-data";

function pt(date: string, count: number): ReportMapTimeSeriesPoint {
  return { date, label: date, count };
}

describe("mergeSeries", () => {
  it("unions buckets across series and zero-fills missing values", () => {
    const merged = mergeSeries([
      { label: "Seaborne", color: "#16A34A", points: [pt("2026-05-01", 3), pt("2026-05-03", 5)] },
      { label: "Foot", color: "#F97316", points: [pt("2026-05-02", 2), pt("2026-05-03", 1)] },
    ]);
    expect(merged.map((r) => r.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
    // s0 = seaborne, s1 = foot; missing buckets zero-filled.
    expect(merged[0]).toMatchObject({ date: "2026-05-01", s0: 3, s1: 0 });
    expect(merged[1]).toMatchObject({ date: "2026-05-02", s0: 0, s1: 2 });
    expect(merged[2]).toMatchObject({ date: "2026-05-03", s0: 5, s1: 1 });
  });

  it("sorts rows by the sortable date key", () => {
    const merged = mergeSeries([
      { label: "A", color: "#000", points: [pt("2026-05-10", 1), pt("2026-05-02", 1)] },
    ]);
    expect(merged.map((r) => r.date)).toEqual(["2026-05-02", "2026-05-10"]);
  });

  it("returns an empty row set when every series is empty", () => {
    expect(mergeSeries([{ label: "A", color: "#000", points: [] }])).toEqual([]);
  });
});

describe("PrintMultiSeriesChart", () => {
  it("renders the sr-only alt table with a column per series and a row per bucket", () => {
    const html = renderToStaticMarkup(
      <PrintMultiSeriesChart
        title="Patrols Over Time by Type"
        series={[
          { label: "Seaborne", color: "#16A34A", points: [pt("2026-05-01", 3)] },
          { label: "Foot", color: "#F97316", points: [pt("2026-05-01", 2)] },
        ]}
      />,
    );
    expect(html).toContain('data-testid="print-multi-series-chart"');
    expect(html).toContain("<caption>Patrols Over Time by Type</caption>");
    // Column headers per series.
    expect(html).toContain(">Seaborne</th>");
    expect(html).toContain(">Foot</th>");
    // One data row: period label + both series counts.
    expect(html).toContain("<td>2026-05-01</td>");
    expect(html).toContain("<td>3</td>");
    expect(html).toContain("<td>2</td>");
    // Compact legend present.
    expect(html).toContain('data-testid="print-multi-series-legend"');
  });

  it("renders an empty state when there is no data in any series", () => {
    const html = renderToStaticMarkup(
      <PrintMultiSeriesChart
        title="Patrols Over Time by Type"
        series={[
          { label: "Seaborne", color: "#16A34A", points: [] },
          { label: "Foot", color: "#F97316", points: [] },
        ]}
      />,
    );
    expect(html).toContain('data-testid="print-multi-series-empty"');
    expect(html).toContain("No patrols over time by type data for this period.");
  });
});
