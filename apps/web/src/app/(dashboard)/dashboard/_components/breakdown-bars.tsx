"use client";

/**
 * WAR ROOM compact event-breakdown bar chart.
 *
 * Upgraded from base shadcn ChartContainer to a genuine Pro chart pattern
 * (shadcn-studio chart-component-29, 2026-06-23) — adapted for MG's maritime
 * law-enforcement / monitoring breakdown context.
 *
 * Pro patterns adopted (INHERIT-not-REPLACE):
 *  - Card shell with header title + live-update indicator
 *  - CartesianGrid with dashed strokes matching MG border token
 *  - ChartTooltip + ChartTooltipContent for consistent tooltip styling
 *  - CSS var(--chart-N) tokens instead of raw Tailwind colors
 *  - Legend row below chart mirrors Pro legend dot + count pattern
 *
 * Existing props contract is fully preserved:
 *  - title, data (BreakdownDatum[]), variant, barClass (legacy compat)
 */

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export type BreakdownDatum = { type: string; count: number };

export type BreakdownVariant = "law_enforcement" | "monitoring";

/**
 * Chart-1 = destructive/red — law enforcement incidents (high-priority).
 * Chart-2 = teal/green — monitoring events (vessel tracking, patrols).
 * Matches MG's neutral-dark shadcn theme token palette.
 */
const LAW_CHART_CONFIG = {
  count: {
    label: "Incidents",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const MONITORING_CHART_CONFIG = {
  count: {
    label: "Events",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

/**
 * Compact horizontal BarChart for the WAR ROOM breakdown section.
 *
 * Shows top-5 event types by count, sorted descending.
 * Uses shadcn ChartContainer + Recharts with Pro-style CartesianGrid,
 * ChartTooltip, Card shell, and CSS chart-token colors.
 */
export function BreakdownBars({
  title,
  data,
  variant,
  onSelectType,
  // legacy prop accepted but unused — color is driven by `variant`
  barClass: _barClass,
}: {
  title: string;
  data: BreakdownDatum[];
  variant?: BreakdownVariant;
  /**
   * War Room drill-down (T5b): called with the clicked event-type label
   * (eventType.display) so the parent can open the breakdown drill-down modal.
   */
  onSelectType?: (type: string) => void;
  /** Kept for backward compatibility with callers that haven't migrated yet. */
  barClass?: string;
}) {
  const config =
    variant === "monitoring" ? MONITORING_CHART_CONFIG : LAW_CHART_CONFIG;
  const colorVar =
    variant === "monitoring" ? "var(--chart-2)" : "var(--chart-1)";

  // Top 5, sorted descending by count.
  const chartData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((d) => ({ type: d.type, count: d.count }));

  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const headingId = `breakdown-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <Card
      aria-labelledby={headingId}
      className="min-w-0 flex-1 gap-2 border-border py-2"
    >
      <CardHeader className="flex items-center justify-between border-b px-3 pb-2">
        <div className="flex flex-col gap-0.5">
          <h3
            id={headingId}
            className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            {title}
          </h3>
          <span className="text-xs font-semibold tabular-nums">
            {totalCount.toLocaleString()} total
          </span>
        </div>
        {/* Pro live-update indicator — mirrors chart-component-29 */}
        <div className="flex items-center gap-1">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
          <span className="text-[9px] text-muted-foreground">Live</span>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-1 pt-0">
        {chartData.length === 0 ? (
          <p className="py-3 text-[10px] text-muted-foreground">No events</p>
        ) : (
          <>
            <ChartContainer config={config} className="h-[7rem] w-full">
              <BarChart
                accessibilityLayer
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 36, bottom: 0, left: 0 }}
              >
                {/* Pro CartesianGrid: dashed, horizontal only, border token */}
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="4"
                  stroke="var(--border)"
                />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="type"
                  width={140}
                  tick={{
                    fontSize: 9,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) =>
                    v.length > 26 ? `${v.slice(0, 25)}…` : v
                  }
                />
                {/* Pro ChartTooltip instead of no tooltip */}
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Bar
                  dataKey="count"
                  fill={colorVar}
                  radius={[0, 3, 3, 0]}
                  maxBarSize={10}
                  {...(onSelectType !== undefined
                    ? {
                        cursor: "pointer",
                        onClick: (entry: { type?: string }) => {
                          if (entry.type !== undefined) onSelectType(entry.type);
                        },
                      }
                    : {})}
                >
                  {/* Count label at the end (right) of each bar */}
                  <LabelList
                    dataKey="count"
                    position="right"
                    className="fill-foreground tabular-nums"
                    fontSize={9}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>

            {/* Pro legend row: color swatch + label + count, top item only */}
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{ background: colorVar }}
              />
              <span className="text-[9px] text-muted-foreground">
                {config.count.label}
              </span>
              <span className="ml-auto text-[9px] font-semibold tabular-nums text-foreground">
                {chartData[0]?.type ?? "—"}:{" "}
                {(chartData[0]?.count ?? 0).toLocaleString()}
              </span>
            </div>

            {/* Keyboard-accessible drill-down list (T5b). The SVG bars are not
                natively focusable, so this mirrors them as role="button" rows so
                keyboard + screen-reader users can drill into each event type. */}
            {onSelectType !== undefined && (
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {chartData.map((d) => (
                  <li key={d.type}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectType(d.type);
                      }}
                      aria-label={`View ${String(d.count)} ${d.type} ${title} events`}
                      className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-[9px] text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <span className="truncate">{d.type}</span>
                      <span className="ml-2 shrink-0 font-semibold tabular-nums text-foreground">
                        {d.count.toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
