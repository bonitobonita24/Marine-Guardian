"use client";

/**
 * Area-covered bar chart — Coverage Report Page 3 sidebar.
 *
 * Horizontal bar chart of coverage_km per enabled AreaBoundary, sourced from
 * accumulateCoverageByBoundary (packages/shared/src/lib/coverage-clip). Sorted
 * DESC by coverageKm, then alphabetically by name for stable ties. The
 * aggregator already does this sort; we re-sort defensively here so the chart
 * is independent of upstream contract drift.
 *
 * Boundaries with zero coverage are filtered out — Page 3's table shows them
 * (so funders see the full enabled-boundary roster) but the chart only
 * surfaces boundaries that were actually patrolled. Zero-bars would just
 * waste vertical real-estate.
 *
 * Uses Recharts directly (no shadcn ChartConfig wrapper) — same rationale as
 * the Page 2 PatrolAreaBarChart: the print-render document does NOT include
 * Tailwind's CSS layers in this sub-tree, so a self-contained inline-style
 * chart avoids token resolution failures during the standalone print HTML
 * render. Restyled (R9, 2026-07-06) to match the live dashboard's shadcn
 * chart look: muted gridlines, `--chart-3` accent (via the `--chart-N`
 * custom properties injected into the print document's <style> block —
 * report-map-report.tsx), rounded bar corners, shadcn-style tooltip.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BoundaryCoverage } from "@marine-guardian/shared/lib/coverage-clip";

interface AreaCoveredChartProps {
  rows: BoundaryCoverage[];
  /** Optional max bars to keep the chart legible on A4 landscape. Default 10. */
  topN?: number;
}

interface ChartRow {
  name: string;
  coverageKm: number;
  fill: string;
}

const BAR_COVERED = "hsl(var(--chart-3))"; // shadcn chart-token accent — Page 3

function buildChartRows(
  rows: BoundaryCoverage[],
  topN: number,
): ChartRow[] {
  return [...rows]
    .filter((r) => r.coverageKm > 0)
    .sort((a, b) => {
      if (b.coverageKm !== a.coverageKm) return b.coverageKm - a.coverageKm;
      return a.areaName.localeCompare(b.areaName);
    })
    .slice(0, topN)
    .map((r) => ({
      name: r.areaName,
      coverageKm: r.coverageKm,
      fill: BAR_COVERED,
    }));
}

export function AreaCoveredChart({
  rows,
  topN = 10,
}: AreaCoveredChartProps) {
  const data = buildChartRows(rows, topN);

  if (data.length === 0) {
    return (
      <div
        data-testid="area-covered-chart-empty"
        style={{
          padding: "16px",
          color: "#6b7280",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: "10px",
        }}
      >
        No coverage to chart for this period.
      </div>
    );
  }

  return (
    <div
      data-testid="area-covered-chart"
      style={{ width: "100%", height: "100%", minHeight: "180px" }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="4" stroke="#e5e7eb" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => v.toFixed(1)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9, fill: "#6b7280" }}
            label={{
              value: "Coverage KM",
              position: "insideBottom",
              offset: -2,
              style: { fontSize: 9, fill: "#6b7280" },
            }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9, fill: "#6b7280" }}
          />
          <Tooltip
            cursor={{ fill: "#f3f4f6" }}
            contentStyle={{
              fontSize: "10px",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
            formatter={(value: number) => [`${value.toFixed(2)} km`, "Coverage"]}
          />
          <Bar
            dataKey="coverageKm"
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
          >
            {data.map((row, idx) => (
              <Cell key={`bar-cell-${String(idx)}`} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
