"use client";

/**
 * Print-safe Time Series line chart — unified component for the Report Map PDF.
 *
 * Merges PrintEventsOverTimeChart + PatrolOverTimeChart (both retired).
 * Uses Recharts directly (no shadcn CSS-var tokens) for the same reason as
 * EventBreakdownChart: the print-render document tree doesn't include Tailwind
 * CSS layers, so self-contained inline styles avoid token resolution failures.
 *
 * Compact mode (title provided): smaller margins/fonts, fixed 110 px height.
 * Full mode (no title): fills container with minHeight 180 px.
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

interface PrintTimeSeriesChartProps {
  series: ReportMapTimeSeriesPoint[];
  title?: string;
  color?: string;
  valueLabel?: string;
  height?: number | string;
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

export function PrintTimeSeriesChart({
  series,
  title,
  color = "#0891b2",
  valueLabel = "Count",
  height,
}: PrintTimeSeriesChartProps) {
  const compact = title !== undefined;
  const resolvedHeight = height ?? (compact ? "110px" : "100%");
  const minH = !compact && height === undefined ? "180px" : undefined;

  if (series.length === 0) {
    return (
      <div
        data-testid="print-time-series-empty"
        style={{
          padding: compact ? "8px" : "16px",
          color: "#6b7280",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: compact ? "9px" : "10px",
        }}
      >
        {title !== undefined
          ? `No ${title.toLowerCase()} data for this period.`
          : "No data for this period."}
      </div>
    );
  }

  const heightCss =
    typeof resolvedHeight === "number"
      ? `${String(resolvedHeight)}px`
      : resolvedHeight;

  return (
    <div
      data-testid="print-time-series-chart"
      style={{ width: "100%", height: heightCss, minHeight: minH }}
    >
      {title !== undefined && (
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
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={series}
          margin={
            compact
              ? { top: 4, right: 12, bottom: 12, left: 0 }
              : { top: 8, right: 16, bottom: 16, left: 0 }
          }
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
            tickMargin={compact ? 4 : 6}
            minTickGap={24}
            tick={{ fontSize: compact ? 8 : 9, fill: "#374151" }}
            tickFormatter={shortDay}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={compact ? 24 : 28}
            allowDecimals={false}
            tick={{ fontSize: compact ? 8 : 9, fill: "#374151" }}
          />
          <Tooltip
            cursor={{ stroke: "#e5e7eb" }}
            contentStyle={{ fontSize: compact ? "9px" : "10px" }}
            formatter={(value: number) => [String(value), valueLabel]}
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
