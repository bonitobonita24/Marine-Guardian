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
 *
 * The x-axis renders the server-provided adaptive `label` field verbatim
 * (day/week/month bucket label — see time-series-bucketing.ts) instead of
 * re-deriving a label from the raw `date` key, mirroring the /map
 * events-over-time-chart.tsx pattern (2026-07-06).
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

/** Rotated x-axis tick so every monthly label fits in a narrow chart. */
function AngledTick({
  x = 0,
  y = 0,
  payload,
  fontSize = 8,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  fontSize?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      dy={3}
      textAnchor="end"
      transform={`rotate(-45, ${String(x)}, ${String(y)})`}
      fontSize={fontSize}
      fill="#6b7280"
    >
      {payload?.value != null ? String(payload.value) : ""}
    </text>
  );
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

  // X-axis tick strategy (owner 2026-07-12): the series already spans the full
  // report range (buildSingleCountSeries zero-fills [from,to]). For a monthly
  // series covering < 2 years show EVERY month (angled so they fit); for a
  // longer span show only the year-boundary (January) labels — a per-year
  // cadence. Non-monthly (week/day) series keep the default thinning.
  const firstLabel = series[0]?.label ?? "";
  const isMonthly = /^[A-Za-z]{3}\s+\d{4}$/.test(firstLabel);
  const allMonths = isMonthly && series.length <= 24;
  const yearTicks = isMonthly
    ? series.filter((p) => /^Jan\s/i.test(p.label)).map((p) => p.label)
    : [];
  const perYear = isMonthly && series.length > 24 && yearTicks.length > 0;
  const tickFontSize = compact ? 7 : 8;

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
          margin={{
            top: compact ? 4 : 8,
            right: compact ? 12 : 16,
            bottom: allMonths ? 30 : compact ? 12 : 16,
            left: 0,
          }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="4"
            stroke="#e5e7eb"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={compact ? 4 : 6}
            {...(allMonths
              ? { interval: 0, height: 42 }
              : perYear
                ? { interval: 0, ticks: yearTicks }
                : { minTickGap: 24 })}
            tick={
              allMonths ? (
                <AngledTick fontSize={tickFontSize} />
              ) : (
                { fontSize: compact ? 8 : 9, fill: "#6b7280" }
              )
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={compact ? 24 : 28}
            allowDecimals={false}
            tick={{ fontSize: compact ? 8 : 9, fill: "#6b7280" }}
          />
          <Tooltip
            cursor={{ stroke: "#e5e7eb" }}
            contentStyle={{
              fontSize: compact ? "9px" : "10px",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
            formatter={(value: number) => [String(value), valueLabel]}
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
