"use client";

/**
 * Municipality coverage bar chart — WAR ROOM section.
 *
 * Grouped horizontal BarChart showing patrol count + event count per
 * municipality over the last 30 days. Matches the BreakdownBars Pro chart
 * pattern: ChartContainer + ChartTooltip + CartesianGrid + Card shell.
 *
 * chart-2 (teal) = patrols  — matches "monitoring" colour convention.
 * chart-1 (red)  = events   — matches "law enforcement" colour convention.
 */

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface MunicipalityCoverageDatum {
  municipality: string;
  province: string;
  patrolCount: number;
  eventCount: number;
}

const CHART_CONFIG = {
  patrolCount: {
    label: "Patrols",
    color: "hsl(var(--chart-2))",
  },
  eventCount: {
    label: "Events",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const HEADING_ID = "municipality-coverage-heading";

export interface ProvinceCoverageRow {
  municipality: string; // holds the province name once grouped (feeds the same YAxis dataKey)
  patrolCount: number;
  eventCount: number;
}

/**
 * Sums per-municipality rows into one row per `province` (Oriental Mindoro /
 * Occidental Mindoro / Palawan). Only provinces actually present in `data`
 * are emitted — never invents an empty region. Exported (pure, no React) so
 * the grouping math is unit-testable without rendering Recharts.
 */
export function groupCoverageByProvince(
  data: MunicipalityCoverageDatum[],
): ProvinceCoverageRow[] {
  const byProvince = data.reduce((map, d) => {
    const existing = map.get(d.province);
    if (existing === undefined) {
      map.set(d.province, {
        municipality: d.province,
        patrolCount: d.patrolCount,
        eventCount: d.eventCount,
      });
    } else {
      existing.patrolCount += d.patrolCount;
      existing.eventCount += d.eventCount;
    }
    return map;
  }, new Map<string, ProvinceCoverageRow>());
  return Array.from(byProvince.values());
}

/**
 * Horizontal grouped BarChart — one bar pair per municipality.
 * Shows "No coverage data" when the data array is empty or still loading.
 */
export function MunicipalityCoverageChart({
  data,
  isLoading,
  rangeLabel,
  compact = false,
  groupByProvince = false,
}: {
  data: MunicipalityCoverageDatum[];
  isLoading: boolean;
  /** Active War Room range label (e.g. "Jun 19 – Jun 26"). */
  rangeLabel: string;
  /** Half-height chart for dense surfaces (Interactive Report Map). */
  compact?: boolean;
  /**
   * Collapse the per-municipality rows into 3 province/region rows ("Oriental
   * Mindoro" / "Occidental Mindoro" / "Palawan") — Interactive Report Map's
   * "Region Coverage" view when no single municipality is selected (All).
   * Defaults false so the War Room dashboard usage is UNCHANGED.
   */
  groupByProvince?: boolean;
}) {
  // Sort descending by total activity, show top 11 (all municipalities).
  // Keep full names so ChartTooltip shows the untruncated municipality name;
  // display truncation is handled by the YAxis tickFormatter below.
  const groupedByProvince = groupByProvince
    ? groupCoverageByProvince(data)
    : null;

  const chartData = [...(groupedByProvince ?? data)]
    .sort((a, b) => b.patrolCount + b.eventCount - (a.patrolCount + a.eventCount))
    .map((d) => ({
      municipality: d.municipality,
      patrolCount: d.patrolCount,
      eventCount: d.eventCount,
    }));

  const totalPatrols = data.reduce((s, d) => s + d.patrolCount, 0);
  const totalEvents = data.reduce((s, d) => s + d.eventCount, 0);
  const heading = groupByProvince ? "Region Coverage" : "Municipality Coverage";

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
            {heading}
          </h3>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {rangeLabel}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-1 pt-0">
        {isLoading || chartData.length === 0 ? (
          <p className="py-3 text-[10px] text-muted-foreground">
            {isLoading ? "Loading…" : "No coverage data"}
          </p>
        ) : (
          <>
            <ChartContainer
              config={CHART_CONFIG}
              className={`${compact ? "h-[7.5rem]" : "h-[15rem]"} w-full`}
            >
              <BarChart
                accessibilityLayer
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="4"
                  stroke="hsl(var(--border))"
                />
                <YAxis
                  dataKey="municipality"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  // Region mode has only 3 short-list province rows, so give the
                  // axis room to render each name IN FULL ("Occidental Mindoro"
                  // etc.) — no truncation (owner 2026-07-06). Municipality mode
                  // keeps the compact width + ellipsis (many, longer names).
                  width={groupByProvince ? 132 : 96}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: string) =>
                    groupByProvince || v.length <= 14 ? v : `${v.slice(0, 13)}…`
                  }
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="patrolCount"
                  fill="hsl(var(--chart-2))"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={11}
                />
                <Bar
                  dataKey="eventCount"
                  fill="hsl(var(--chart-1))"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={11}
                />
              </BarChart>
            </ChartContainer>

            {/* Legend row */}
            <div className="mt-1 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ background: "hsl(var(--chart-2))" }}
                />
                <span className="text-[10px] text-muted-foreground">
                  Patrols{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {totalPatrols}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ background: "hsl(var(--chart-1))" }}
                />
                <span className="text-[10px] text-muted-foreground">
                  Events{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {totalEvents}
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
