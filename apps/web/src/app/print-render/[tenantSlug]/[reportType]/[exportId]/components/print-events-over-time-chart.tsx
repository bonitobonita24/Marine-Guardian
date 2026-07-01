"use client";

/**
 * Print-safe Events Over Time line chart for the Report Map PDF.
 *
 * Uses Recharts directly (no shadcn ChartContainer / CSS-var tokens) — same
 * rationale as EventBreakdownChart: the print-render document does NOT include
 * Tailwind's CSS layers in this sub-tree, so self-contained inline-style charts
 * avoid token resolution failures during the standalone print HTML render.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportMapTimeSeriesPoint } from "@/server/report-map-report/get-report-map-report-data";

interface PrintEventsOverTimeChartProps {
  series: ReportMapTimeSeriesPoint[];
}

/** `MMM d` tick label from a `yyyy-MM-dd` key (no timezone shift). */
function shortDay(key: string): string {
  const parts = key.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return key;
  const local = new Date(y, m - 1, d);
  return local.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PrintEventsOverTimeChart({
  series,
}: PrintEventsOverTimeChartProps) {
  if (series.length === 0) {
    return (
      <div
        data-testid="print-events-over-time-empty"
        style={{
          padding: "16px",
          color: "#6b7280",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: "10px",
        }}
      >
        No events data for this period.
      </div>
    );
  }

  return (
    <div
      data-testid="print-events-over-time-chart"
      style={{ width: "100%", height: "100%", minHeight: "180px" }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={series}
          margin={{ top: 8, right: 16, bottom: 16, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="4"
            stroke="#e5e7eb"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            minTickGap={24}
            tick={{ fontSize: 9, fill: "#374151" }}
            tickFormatter={shortDay}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={28}
            allowDecimals={false}
            tick={{ fontSize: 9, fill: "#374151" }}
          />
          <Tooltip
            cursor={{ stroke: "#e5e7eb" }}
            contentStyle={{ fontSize: "10px" }}
            formatter={(value: number) => [String(value), "Events"]}
            labelFormatter={shortDay}
          />
          <Line
            dataKey="count"
            type="monotone"
            stroke="#0891b2"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
