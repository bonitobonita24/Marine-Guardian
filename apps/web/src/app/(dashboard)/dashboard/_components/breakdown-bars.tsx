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

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Text,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const MONITORING_CHART_CONFIG = {
  count: {
    label: "Events",
    color: "hsl(var(--chart-2))",
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
  compact = false,
  // legacy prop accepted but unused — color is driven by `variant`
  barClass: _barClass,
}: {
  title: string;
  data: BreakdownDatum[];
  variant?: BreakdownVariant;
  /** Half-height chart for dense surfaces (Interactive Report Map). */
  compact?: boolean;
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
    variant === "monitoring" ? "hsl(var(--chart-2))" : "hsl(var(--chart-1))";

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
      className={cn(
        "min-w-0 flex-1 gap-2 border-border py-2",
        // Report Map (compact): fill the grid cell so the chart uses the full
        // card height instead of leaving a large empty margin below the bars.
        compact && "flex h-full flex-col",
      )}
    >
      {compact ? (
        // Report Map: title (word-wraps) on the left, a thin vertical partition,
        // then the total count on the right. No "Live" indicator, no "total" word.
        <CardHeader className="flex flex-row items-stretch justify-between gap-2 border-b px-3 pb-1.5">
          <h3
            id={headingId}
            className="min-w-0 flex-1 self-center text-[10px] font-bold uppercase leading-tight tracking-wider text-foreground/85"
          >
            {title}
          </h3>
          <div className="w-px shrink-0 self-stretch bg-border" aria-hidden="true" />
          <span className="shrink-0 self-center text-sm font-bold tabular-nums">
            {totalCount.toLocaleString()}
          </span>
        </CardHeader>
      ) : (
        <CardHeader className="flex items-center justify-between border-b px-3 pb-2">
          <div className="flex flex-col gap-0.5">
            <h3
              id={headingId}
              className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              {title}
            </h3>
            <span className="shrink-0 text-xs font-semibold tabular-nums">
              {totalCount.toLocaleString()} total
            </span>
          </div>
          {/* Pro live-update indicator — mirrors chart-component-29 */}
          <div className="flex shrink-0 items-center gap-1">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-green-500" />
            </span>
            <span className="text-[9px] text-muted-foreground">Live</span>
          </div>
        </CardHeader>
      )}

      <CardContent
        className={cn(
          "px-3 pb-1 pt-0",
          compact && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {chartData.length === 0 ? (
          <p className="py-3 text-[10px] text-muted-foreground">No events</p>
        ) : (
          <>
            <ChartContainer
              config={config}
              className={
                compact
                  ? "aspect-auto min-h-[4rem] w-full flex-1"
                  : "h-[7rem] w-full"
              }
            >
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
                  stroke="hsl(var(--border))"
                />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="type"
                  width={compact ? 116 : 140}
                  tickLine={false}
                  axisLine={false}
                  {...(compact
                    ? {
                        // Report Map: WORD-WRAP long event-type labels onto
                        // multiple lines (no "…" truncation). Narrower column +
                        // wider bars uses the previously-blank left space.
                        tick: (props: {
                          x: number;
                          y: number;
                          payload: { value: string };
                        }) => (
                          <Text
                            x={props.x}
                            y={props.y}
                            width={110}
                            textAnchor="end"
                            verticalAnchor="middle"
                            fontSize={9}
                            fill="hsl(var(--muted-foreground))"
                          >
                            {props.payload.value}
                          </Text>
                        ),
                      }
                    : {
                        tick: {
                          fontSize: 9,
                          fill: "hsl(var(--muted-foreground))",
                        },
                        tickFormatter: (v: string) =>
                          v.length > 26 ? `${v.slice(0, 25)}…` : v,
                      })}
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
                  maxBarSize={compact ? 18 : 10}
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

            {/* Screen-reader / keyboard drill-down list (T5b). Visually hidden
                (sr-only) per the owner's 2026-06-27 request to show only the bar
                chart with the count at each bar's end — but kept in the a11y tree
                because the SVG bars are not natively focusable, so keyboard +
                screen-reader users still get a focusable button per event type
                (WCAG 2.2 AA / Rule 33 gov-LGU gate). */}
            {onSelectType !== undefined && (
              <ul className="sr-only">
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
