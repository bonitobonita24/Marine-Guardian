"use client";

/**
 * Events-over-time line chart — Interactive Report Map (2026-06-27).
 *
 * Pure presentational LineChart (shadcn ChartContainer + Recharts) showing the
 * daily event count across the active report window. Data comes from
 * reportMap.eventsOverTime (already a continuous {date,count} series when a
 * range is set). Matches the BreakdownBars / MunicipalityCoverageChart Pro card
 * pattern: Card shell + ChartTooltip + CartesianGrid + CSS chart-token colours.
 */

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface EventsOverTimeDatum {
  /** `yyyy-MM-dd` day key. */
  date: string;
  count: number;
}

const CHART_CONFIG = {
  count: {
    label: "Events",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const HEADING_ID = "events-over-time-heading";

/** Short `MMM d` tick label from a `yyyy-MM-dd` key (no timezone shift). */
function shortDay(key: string): string {
  const parts = key.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return key;
  const local = new Date(y, m - 1, d);
  return local.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  /** Half-height chart for dense surfaces (Interactive Report Map). */
  compact?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <Card
      aria-labelledby={HEADING_ID}
      className="min-w-0 flex-1 gap-2 border-border py-3"
    >
      <CardHeader className="px-3 pb-0 pt-0">
        <div className="flex items-center justify-between">
          <h3
            id={HEADING_ID}
            className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Events Over Time
          </h3>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
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
              className={`${compact ? "h-[7.5rem]" : "h-[15rem]"} w-full`}
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
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  minTickGap={24}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={shortDay}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent labelFormatter={shortDay} />}
                />
                <Line
                  dataKey="count"
                  type="monotone"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>

            <div className="mt-1 flex items-center gap-1.5">
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
