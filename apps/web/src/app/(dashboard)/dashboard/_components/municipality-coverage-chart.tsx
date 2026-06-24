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
    color: "var(--chart-2)",
  },
  eventCount: {
    label: "Events",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const HEADING_ID = "municipality-coverage-heading";

/**
 * Horizontal grouped BarChart — one bar pair per municipality.
 * Shows "No coverage data" when the data array is empty or still loading.
 */
export function MunicipalityCoverageChart({
  data,
  isLoading,
}: {
  data: MunicipalityCoverageDatum[];
  isLoading: boolean;
}) {
  // Sort descending by total activity, show top 11 (all municipalities).
  const chartData = [...data]
    .sort((a, b) => b.patrolCount + b.eventCount - (a.patrolCount + a.eventCount))
    .map((d) => ({
      municipality: d.municipality.length > 12 ? `${d.municipality.slice(0, 11)}…` : d.municipality,
      patrolCount: d.patrolCount,
      eventCount: d.eventCount,
    }));

  const totalPatrols = data.reduce((s, d) => s + d.patrolCount, 0);
  const totalEvents = data.reduce((s, d) => s + d.eventCount, 0);

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
            Municipality Coverage
          </h3>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            30 days
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
            <ChartContainer config={CHART_CONFIG} className="h-[9rem] w-full">
              <BarChart
                accessibilityLayer
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="4"
                  stroke="var(--border)"
                />
                <YAxis
                  dataKey="municipality"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="patrolCount"
                  fill="var(--chart-2)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={8}
                />
                <Bar
                  dataKey="eventCount"
                  fill="var(--chart-1)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={8}
                />
              </BarChart>
            </ChartContainer>

            {/* Legend row */}
            <div className="mt-1 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ background: "var(--chart-2)" }}
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
                  style={{ background: "var(--chart-1)" }}
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
