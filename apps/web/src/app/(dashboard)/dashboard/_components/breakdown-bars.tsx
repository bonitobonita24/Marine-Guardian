"use client";

/**
 * WAR ROOM compact event-breakdown bar chart.
 * Conforms to docs/v2/mpa-command-center-v6.jsx law-enforcement / monitoring
 * mini-cards. Upgraded from custom CSS bars to shadcn ChartContainer +
 * Recharts BarChart (Issue C fix, 2026-06-23) so the WAR ROOM uses the
 * same chart system as the rest of MG (fuel-analytics-panel.tsx).
 *
 * Props are backward-compatible: callers still pass `title`, `data`, and a
 * semantic `variant` ("law_enforcement" | "monitoring") that drives the color
 * via the ChartConfig token rather than a raw Tailwind class.
 */

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

export type BreakdownDatum = { type: string; count: number };

export type BreakdownVariant = "law_enforcement" | "monitoring";

const LAW_CHART_CONFIG = {
  count: {
    label: "Events",
    color: "hsl(var(--destructive))",
  },
} satisfies ChartConfig;

const MONITORING_CHART_CONFIG = {
  count: {
    label: "Events",
    color: "hsl(var(--success))",
  },
} satisfies ChartConfig;

/**
 * Compact horizontal BarChart for the WAR ROOM breakdown section.
 * Shows top-5 event types by count, sorted descending.
 * Uses shadcn ChartContainer + Recharts so theming and tooltips are consistent
 * with the rest of MG.
 */
export function BreakdownBars({
  title,
  data,
  variant,
  // legacy prop accepted but ignored — color is now driven by `variant`
  barClass: _barClass,
}: {
  title: string;
  data: BreakdownDatum[];
  variant?: BreakdownVariant;
  /** Kept for backward compatibility with callers that haven't migrated yet. */
  barClass?: string;
}) {
  const config =
    variant === "monitoring" ? MONITORING_CHART_CONFIG : LAW_CHART_CONFIG;
  const color = config.count.color;

  // Show top 5, sorted descending by count.
  const chartData = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((d) => ({ type: d.type, count: d.count }));

  const headingId = `breakdown-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2"
    >
      <h3
        id={headingId}
        className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        {title}
      </h3>

      {chartData.length === 0 ? (
        <p className="py-2 text-[10px] text-muted-foreground">No events</p>
      ) : (
        <ChartContainer config={config} className="h-[7rem] w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="type"
              width={60}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) =>
                v.length > 10 ? `${v.slice(0, 9)}…` : v
              }
            />
            <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={10}>
              {chartData.map((entry) => (
                <Cell key={entry.type} fill={color} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}
