"use client";

/**
 * Print-safe Patrol Count Over Time line chart for the Report Map PDF.
 *
 * Cloned from PrintEventsOverTimeChart — same print-safe rationale (no
 * Tailwind CSS-var tokens; self-contained inline styles).
 *
 * Renders a count-per-day line chart for a single patrol type (seaborne or
 * foot). Rendered twice on the Patrol section: once for seaborne, once for
 * foot — fed by PatrolListChartData.patrolCountByTypeOverTime.
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

interface PatrolOverTimeChartProps {
  series: ReportMapTimeSeriesPoint[];
  title: string;
  color?: string;
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

export function PatrolOverTimeChart({
  series,
  title,
  color = "#0f766e",
}: PatrolOverTimeChartProps) {
  if (series.length === 0) {
    return (
      <div
        data-testid="print-patrol-over-time-empty"
        style={{
          padding: "8px",
          color: "#6b7280",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: "9px",
        }}
      >
        No {title.toLowerCase()} patrol data for this period.
      </div>
    );
  }

  return (
    <div
      data-testid="print-patrol-over-time-chart"
      style={{ width: "100%", height: "110px" }}
    >
      <div
        style={{
          fontSize: "9px",
          fontWeight: 600,
          color: "#374151",
          marginBottom: "2px",
        }}
      >
        {title}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={series}
          margin={{ top: 4, right: 12, bottom: 12, left: 0 }}
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
            tickMargin={4}
            minTickGap={24}
            tick={{ fontSize: 8, fill: "#374151" }}
            tickFormatter={shortDay}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={24}
            allowDecimals={false}
            tick={{ fontSize: 8, fill: "#374151" }}
          />
          <Tooltip
            cursor={{ stroke: "#e5e7eb" }}
            contentStyle={{ fontSize: "9px" }}
            formatter={(value: number) => [String(value), "Patrols"]}
            labelFormatter={shortDay}
          />
          <Line
            dataKey="count"
            type="monotone"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
