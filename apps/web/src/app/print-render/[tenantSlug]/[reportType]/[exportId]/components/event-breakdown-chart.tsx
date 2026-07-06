"use client";

/**
 * Event-breakdown bar chart — Per Area Report Page 1.
 *
 * Horizontal bar chart of event count per dynamic EventType bucket, sourced
 * from getPerAreaReportData → lawEnforcementBreakdown / monitoringBreakdown.
 * Sorted DESC by count, then alphabetically by display label for stable ties.
 * The data loader already does this sort; we re-sort defensively here so the
 * chart is independent of upstream contract drift.
 *
 * Two variants: `lawEnforcement` (chart-1 — matches the WAR ROOM dashboard's
 * "events" bar colour, MunicipalityCoverageChart/BreakdownBars) and
 * `monitoring` (chart-2 — matches the dashboard's "patrols"/monitoring
 * colour). The variant also drives the empty-state copy. The actual bar
 * color is uniform within a chart; per-bar variation lands later if a tenant
 * requests violation-type categorisation (out of scope for 6.2a).
 *
 * Uses Recharts directly (no shadcn ChartConfig wrapper) — same rationale as
 * AreaCoveredChart: the print-render document does NOT include Tailwind's
 * CSS layers in this sub-tree, so a self-contained inline-style chart avoids
 * token resolution failures during the standalone print HTML render. Colors
 * reference the `--chart-1`/`--chart-2` custom properties injected into the
 * document's <style> block (report-map-report.tsx) — plain CSS custom
 * properties resolve fine without Tailwind (R9, 2026-07-06), so the printed
 * bar colour matches the live dashboard's shadcn charts exactly instead of
 * the previous hardcoded red/cyan palette.
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
import type { EventTypeBreakdownRow } from "@/server/per-area-report/get-per-area-report-data";
import {
  canonicalIndex,
  type EventTypeVariant,
} from "@/lib/event-type-order";
import { eventTypeIcon } from "@/lib/event-type-icon";

export type EventBreakdownVariant = "lawEnforcement" | "monitoring";

interface EventBreakdownChartProps {
  rows: EventTypeBreakdownRow[];
  variant: EventBreakdownVariant;
  /** Optional max bars to keep the chart legible on A4 landscape. Default 10. */
  topN?: number;
}

interface ChartRow {
  name: string;
  count: number;
  fill: string;
}

const BAR_LAW_ENFORCEMENT = "hsl(var(--chart-1))"; // matches dashboard "events" colour
const BAR_MONITORING = "hsl(var(--chart-2))"; // matches dashboard "monitoring/patrols" colour

function colorForVariant(variant: EventBreakdownVariant): string {
  return variant === "lawEnforcement"
    ? BAR_LAW_ENFORCEMENT
    : BAR_MONITORING;
}

function emptyCopyForVariant(variant: EventBreakdownVariant): string {
  return variant === "lawEnforcement"
    ? "No law enforcement events for this period."
    : "No monitoring events for this period.";
}

/**
 * Map the PDF chart's camelCase variant to the shared canonical-order variant.
 */
function orderVariantFor(variant: EventBreakdownVariant): EventTypeVariant {
  return variant === "lawEnforcement" ? "law_enforcement" : "monitoring";
}

/**
 * Build the chart rows in the owner's fixed canonical event-type sequence
 * (shared with the Command Center / Report Map breakdown charts via
 * {@link canonicalIndex}). Canonical types come first in their fixed order;
 * any type outside the canonical sequence follows, by count descending then
 * display ascending (the prior PDF tiebreak). Zero-count types are dropped so
 * the A4 chart stays legible. Exported for unit testing.
 */
export function buildChartRows(
  rows: EventTypeBreakdownRow[],
  variant: EventBreakdownVariant,
  topN: number,
): ChartRow[] {
  const fill = colorForVariant(variant);
  const orderVariant = orderVariantFor(variant);
  return [...rows]
    .filter((r) => r.count > 0)
    .sort((a, b) => {
      const ia = canonicalIndex(a.display, orderVariant);
      const ib = canonicalIndex(b.display, orderVariant);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1; // canonical types before unlisted
      if (ib !== -1) return 1;
      if (b.count !== a.count) return b.count - a.count; // both unlisted → count desc
      return a.display.localeCompare(b.display);
    })
    .slice(0, topN)
    .map((r) => ({
      name: r.display,
      count: r.count,
      fill,
    }));
}

/**
 * Custom YAxis category tick: the event-type icon + the type label, so the
 * funder PDF chart carries the same per-type glyphs as the on-screen breakdown
 * surfaces (owner directive 2026-06-28 — "every event type must show its
 * appropriate icon"). Rendered via <foreignObject> so the lucide <svg> draws
 * cleanly inside the recharts SVG — a nested <svg> tick strips/clips (see the
 * on-screen 28n fix). Icon tinted the variant bar colour for cohesion; label
 * truncates with an ellipsis to stay inside the A4 gutter. Recharts clones this
 * element with the x/y/payload tick props. Exported for unit testing.
 */
export function BreakdownYAxisTick({
  x = 0,
  y = 0,
  payload,
  variant,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  variant: EventBreakdownVariant;
}) {
  const label = payload?.value != null ? String(payload.value) : "";
  const Icon = eventTypeIcon(label, orderVariantFor(variant));
  const iconColor = colorForVariant(variant);
  const width = 146;
  return (
    <foreignObject x={x - width} y={y - 7} width={width} height={14}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "3px",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          lineHeight: 1,
          paddingRight: "4px",
        }}
      >
        <Icon size={10} color={iconColor} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontSize: "9px",
            color: "#374151",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
      </div>
    </foreignObject>
  );
}

export function EventBreakdownChart({
  rows,
  variant,
  topN = 10,
}: EventBreakdownChartProps) {
  const data = buildChartRows(rows, variant, topN);

  if (data.length === 0) {
    return (
      <div
        data-testid={`event-breakdown-chart-empty-${variant}`}
        style={{
          padding: "16px",
          color: "#6b7280",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: "10px",
        }}
      >
        {emptyCopyForVariant(variant)}
      </div>
    );
  }

  return (
    <div
      data-testid={`event-breakdown-chart-${variant}`}
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
            label={{
              value: "Event Count",
              position: "insideBottom",
              offset: -2,
              style: { fontSize: 9, fill: "#6b7280" },
            }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={<BreakdownYAxisTick variant={variant} />}
          />
          <Tooltip
            cursor={{ fill: "#f3f4f6" }}
            contentStyle={{
              fontSize: "10px",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
            formatter={(value: number) => [String(value), "Events"]}
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
