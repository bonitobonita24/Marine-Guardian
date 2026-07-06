"use client";

/**
 * Patrol-to-Area bar chart — Coverage Report Page 2 sidebar.
 *
 * Horizontal bar chart of patrol counts per enabled AreaBoundary. Sorted
 * DESC by count, then alphabetically by name for stable ties. Empty
 * roster (no enabled boundaries) renders a single "Outside enabled
 * boundaries" bar when unattributedPatrolCount > 0, else an empty-state
 * panel.
 *
 * Uses Recharts directly (no shadcn ChartConfig wrapper) because the
 * print-render document does NOT include Tailwind's CSS layers in this
 * sub-tree — keeping the chart self-contained via inline styles +
 * Recharts primitives avoids token resolution failures during the
 * standalone print HTML render. Restyled (R9, 2026-07-06) to match the live
 * dashboard's shadcn chart look: muted gridlines, `--chart-4` accent (via
 * the `--chart-N` custom properties injected into the print document's
 * <style> block — report-map-report.tsx), rounded bar corners, shadcn-style
 * tooltip. The "Outside enabled boundaries" bar stays neutral gray — it is
 * deliberately NOT a category colour.
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
import type { AreaPatrolCount } from "@marine-guardian/shared/lib/area-attribution";

interface PatrolAreaBarChartProps {
  rows: AreaPatrolCount[];
  unattributedCount: number;
  /** Optional max bars to keep the chart legible on A4 landscape. Default 10. */
  topN?: number;
}

interface ChartRow {
  name: string;
  count: number;
  fill: string;
}

const BAR_BOUNDARY = "hsl(var(--chart-4))"; // shadcn chart-token accent — Page 2
const BAR_OUTSIDE = "#9ca3af"; // gray-400 — deliberately neutral, not a category colour

function buildChartRows(
  rows: AreaPatrolCount[],
  unattributedCount: number,
  topN: number,
): ChartRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.patrolCount !== a.patrolCount) return b.patrolCount - a.patrolCount;
    return a.areaName.localeCompare(b.areaName);
  });
  const top = sorted.slice(0, topN).map((r) => ({
    name: r.areaName,
    count: r.patrolCount,
    fill: BAR_BOUNDARY,
  }));
  if (unattributedCount > 0) {
    top.push({
      name: "Outside enabled boundaries",
      count: unattributedCount,
      fill: BAR_OUTSIDE,
    });
  }
  return top;
}

export function PatrolAreaBarChart({
  rows,
  unattributedCount,
  topN = 10,
}: PatrolAreaBarChartProps) {
  const data = buildChartRows(rows, unattributedCount, topN);

  if (data.length === 0) {
    return (
      <div
        data-testid="bar-chart-empty"
        style={{
          padding: "16px",
          color: "#6b7280",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: "10px",
        }}
      >
        No enabled boundaries — bar chart not applicable.
      </div>
    );
  }

  return (
    <div
      data-testid="patrol-area-bar-chart"
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
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9, fill: "#6b7280" }}
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
          />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {data.map((row, idx) => (
              <Cell key={`bar-cell-${String(idx)}`} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
