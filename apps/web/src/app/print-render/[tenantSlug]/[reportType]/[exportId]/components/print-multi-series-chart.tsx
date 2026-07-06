"use client";

/**
 * Print-safe MULTI-series line chart — Report Map PDF (R7, 2026-07-06).
 *
 * Sibling of PrintTimeSeriesChart: plots two or more time series on the SAME
 * axes (shared x = time buckets), each in its own color, with a compact
 * legend. Introduced to combine the former two separate "Seaborne Patrols
 * Over Time" / "Foot Patrols Over Time" charts into one "Patrols Over Time
 * by Type" chart. PrintTimeSeriesChart is deliberately left untouched so its
 * existing single-series callers keep working.
 *
 * Same print-safety rationale as PrintTimeSeriesChart / EventBreakdownChart:
 * Recharts directly (no shadcn CSS-var tokens), self-contained inline styles
 * — the print-render document tree has no Tailwind layers. This is NOT a map
 * island, so it never touches window.__renderPending.
 *
 * Data model: each series carries its own ReportMapTimeSeriesPoint[]. The
 * series can have DIFFERENT bucket sets (e.g. the sparse-series path when the
 * report has no from/to bounds) — they are merged here by the sortable `date`
 * key into one row set, the union of all buckets, missing values filled with
 * 0 (these are counts, so 0 is the correct absence value and keeps each line
 * continuous). The x-axis renders the adaptive `label` field verbatim
 * (day/week/month bucket label — see time-series-bucketing.ts).
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

export interface PrintChartSeries {
  /** Legend label + tooltip name for this series (e.g. "Seaborne"). */
  label: string;
  /** Line + legend swatch color. */
  color: string;
  /** This series' own time-bucket points. */
  points: ReportMapTimeSeriesPoint[];
}

interface PrintMultiSeriesChartProps {
  series: PrintChartSeries[];
  title?: string;
  height?: number | string;
}

interface MergedRow {
  date: string;
  label: string;
  /** One numeric field per series, keyed `s${index}`. */
  [seriesKey: string]: string | number;
}

function seriesKey(index: number): string {
  return `s${String(index)}`;
}

/**
 * Merge N series into one row set keyed by the sortable `date` bucket key.
 * The union of every series' buckets becomes the row set; a series missing a
 * bucket contributes 0 there. `label` is taken from whichever series first
 * supplies that date (all series share the same adaptive label for a given
 * bucket when they come from the same bucketing pass).
 */
export function mergeSeries(series: PrintChartSeries[]): MergedRow[] {
  const byDate = new Map<string, MergedRow>();
  series.forEach((s, index) => {
    const key = seriesKey(index);
    for (const p of s.points) {
      let row = byDate.get(p.date);
      if (row === undefined) {
        row = { date: p.date, label: p.label };
        byDate.set(p.date, row);
      }
      row[key] = p.count;
    }
  });
  const rows = Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  // Zero-fill any bucket a given series didn't supply, so every line stays
  // continuous across the shared x-axis.
  for (const row of rows) {
    series.forEach((_, index) => {
      const key = seriesKey(index);
      if (typeof row[key] !== "number") row[key] = 0;
    });
  }
  return rows;
}

export function PrintMultiSeriesChart({
  series,
  title,
  height,
}: PrintMultiSeriesChartProps) {
  const compact = title !== undefined;
  const resolvedHeight = height ?? (compact ? "110px" : "100%");
  const minH = !compact && height === undefined ? "180px" : undefined;

  const merged = mergeSeries(series);

  if (merged.length === 0) {
    return (
      <div
        data-testid="print-multi-series-empty"
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
    <figure
      data-testid="print-multi-series-chart"
      style={{ margin: 0, padding: 0, width: "100%" }}
      aria-label={title ?? "Multi-series time chart"}
    >
      {/* Accessible text alternative: one row per bucket, one column per
          series — mirrors the sr-only alt tables elsewhere in this report. */}
      <figcaption className="sr-only">
        <table>
          <caption>{title ?? "Multi-series time chart"}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {series.map((s) => (
                <th scope="col" key={s.label}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {merged.map((row) => (
              <tr key={row.date}>
                <td>{row.label}</td>
                {series.map((s, index) => (
                  <td key={s.label}>{String(row[seriesKey(index)] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "2px",
        }}
      >
        {title !== undefined && (
          <div style={{ fontSize: "9px", fontWeight: 600, color: "#374151" }}>
            {title}
          </div>
        )}
        {/* Compact legend — two swatches + labels. */}
        <div
          data-testid="print-multi-series-legend"
          aria-hidden="true"
          style={{ display: "flex", gap: "10px" }}
        >
          {series.map((s) => (
            <span
              key={s.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "8px",
                color: "#374151",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  background: s.color,
                  borderRadius: "1px",
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{ width: "100%", height: heightCss, minHeight: minH }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={merged}
            margin={
              compact
                ? { top: 4, right: 12, bottom: 12, left: 0 }
                : { top: 8, right: 16, bottom: 16, left: 0 }
            }
          >
            <CartesianGrid vertical={false} strokeDasharray="4" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={compact ? 4 : 6}
              minTickGap={24}
              tick={{ fontSize: compact ? 8 : 9, fill: "#6b7280" }}
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
            />
            {series.map((s, index) => (
              <Line
                key={s.label}
                name={s.label}
                dataKey={seriesKey(index)}
                type="monotone"
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
