"use client";

/**
 * Events-over-time line chart — Interactive Report Map (2026-06-27).
 *
 * Pure presentational LineChart (shadcn ChartContainer + Recharts) showing the
 * event/patrol counts across the active report window, bucketed adaptively by
 * the requested span (day/week/month — see
 * server/trpc/routers/time-series-bucketing.ts). Data comes from
 * reportMap.eventsOverTime (already a continuous {date,label,count,patrolCount}
 * series when a range is set) — the server pre-formats `label` per bucket, so
 * the chart just renders it verbatim. Matches the BreakdownBars /
 * MunicipalityCoverageChart Pro card pattern: Card shell + ChartTooltip +
 * CartesianGrid + CSS chart-token colours.
 */

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  COMPACT_CARD_SHORT_CLASS,
  COMPACT_CHART_BODY_CLASS,
  COMPACT_HIDE_WHEN_SHORT_CLASS,
  COMPACT_LEGEND_SHORT_CLASS,
} from "./compact-chart-density";

export interface EventsOverTimeDatum {
  /** Sortable bucket key: `yyyy-MM-dd` (day/week-start) or `yyyy-MM` (month). */
  date: string;
  /** Pre-formatted display label for this bucket (e.g. "Jun 3", "Jan 2026"). */
  label: string;
  count: number;
  /** Patrol count for the same bucket (continuous zero-filled series as `count`). */
  patrolCount: number;
}

const CHART_CONFIG = {
  count: {
    label: "Events",
    color: "hsl(var(--chart-1))",
  },
  patrolCount: {
    label: "Patrols",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const HEADING_ID = "events-over-time-heading";

export function EventsOverTimeChart({
  data,
  isLoading,
  rangeLabel,
  compact = false,
}: {
  data: EventsOverTimeDatum[];
  isLoading: boolean;
  /** Active report range label (e.g. "May 28 – Jun 27"). */
  rangeLabel: string;
  /**
   * Half-height chart for dense surfaces (Interactive Report Map). On SHORT
   * viewports (<800px tall) the compact variant shrinks further and drops
   * non-essential chrome so the whole panel fits the map's overlay column —
   * see ./compact-chart-density.ts for the measurements behind the threshold.
   */
  compact?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const totalPatrols = data.reduce((s, d) => s + d.patrolCount, 0);

  return (
    <Card
      aria-labelledby={HEADING_ID}
      className={`min-w-0 flex-1 gap-2 border-border py-3 ${
        compact ? COMPACT_CARD_SHORT_CLASS : ""
      }`}
    >
      <CardHeader className="px-3 pb-0 pt-0">
        <div className="flex items-center justify-between">
          <h3
            id={HEADING_ID}
            className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Events vs Patrols Over Time
          </h3>
          <span
            className={`text-xs font-semibold tabular-nums text-muted-foreground ${
              compact ? COMPACT_HIDE_WHEN_SHORT_CLASS : ""
            }`}
          >
            {rangeLabel}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-1 pt-0">
        {isLoading || data.length === 0 ? (
          <p className="py-3 text-[10px] text-muted-foreground">
            {isLoading ? "Loading…" : "No events in range"}
          </p>
        ) : (
          <>
            <ChartContainer
              config={CHART_CONFIG}
              className={`${
                compact ? COMPACT_CHART_BODY_CLASS : "h-[15rem]"
              } w-full`}
            >
              <LineChart
                accessibilityLayer
                data={data}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="4"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  minTickGap={24}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Line
                  dataKey="count"
                  type="monotone"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="patrolCount"
                  type="monotone"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>

            {/* Legend row — KEPT at every size: it carries the Events/Patrols
                totals, which are data, not chrome. */}
            <div
              className={`mt-1 flex items-center gap-3 ${
                compact ? COMPACT_LEGEND_SHORT_CLASS : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ background: "hsl(var(--chart-1))" }}
                />
                <span className="text-[10px] text-muted-foreground">
                  Events{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {total.toLocaleString()}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ background: "hsl(var(--chart-2))" }}
                />
                <span className="text-[10px] text-muted-foreground">
                  Patrols{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {totalPatrols.toLocaleString()}
                  </span>
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
