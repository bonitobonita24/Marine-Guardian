"use client";

/**
 * WAR ROOM event-breakdown — a labelled horizontal bar LIST (owner design
 * 2026-06-28, ref: yellow "Organic/Direct/…" mock). Each row is a left-anchored
 * bar whose fill width is proportional to the count; the event-type icon + name
 * sit INSIDE/over the bar at the left, and the count sits in a fixed right-hand
 * column. Replaces the prior recharts BarChart (axis-label layout) — plain
 * CSS/flex gives exact control over "name in bar, number on the right".
 *
 * Preserved: title, data (BreakdownDatum[]), variant, onSelectType drill-down,
 * compact mode, canonical event-type order, per-type icons, barClass (legacy).
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_ORDER, normalizeTypeLabel } from "@/lib/event-type-order";
import { eventTypeIcon } from "@/lib/event-type-icon";

export type BreakdownDatum = { type: string; count: number };

export type BreakdownVariant = "law_enforcement" | "monitoring";

/**
 * Order a breakdown dataset for display. When `variant` has a canonical order,
 * listed types come first in that exact sequence; any unlisted types follow,
 * sorted by count descending. With no variant, falls back to top-5 by count.
 * Exported for unit testing.
 */
export function orderBreakdownData(
  data: BreakdownDatum[],
  variant: BreakdownVariant | undefined,
): BreakdownDatum[] {
  const order = variant !== undefined ? EVENT_TYPE_ORDER[variant] : undefined;
  const indexOfType = (type: string): number => {
    if (order === undefined) return -1;
    const n = normalizeTypeLabel(type);
    return order.findIndex((o) => normalizeTypeLabel(o) === n);
  };
  return [...data]
    .sort((a, b) => {
      const ia = indexOfType(a.type);
      const ib = indexOfType(b.type);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1; // listed types before unlisted
      if (ib !== -1) return 1;
      return b.count - a.count; // both unlisted → by count
    })
    .slice(0, order !== undefined ? order.length + 2 : 5)
    .map((d) => ({ type: d.type, count: d.count }));
}

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
  const colorVar =
    variant === "monitoring" ? "hsl(var(--chart-2))" : "hsl(var(--chart-1))";

  // Fixed canonical order per variant (Report Map + Command Center); falls back
  // to top-5 by count when no variant is set.
  const chartData = orderBreakdownData(data, variant);

  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  // Longest displayed bar = 100% of the track width.
  const maxCount = Math.max(...chartData.map((d) => d.count), 1);
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
        <CardHeader className="flex flex-row items-stretch justify-between gap-2 border-b px-3 py-1.5">
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
          <ul
            className={cn(
              "flex flex-col gap-1.5 py-1",
              // Report Map (compact): centre the rows in the filled card cell.
              compact && "min-h-0 flex-1 justify-center",
            )}
          >
            {chartData.map((d) => {
              const Icon = eventTypeIcon(d.type, variant);
              // Min sliver so any non-zero count still reads as a bar.
              const pct = Math.max((d.count / maxCount) * 100, 3);
              const interactive = onSelectType !== undefined;
              const barCls = cn(
                "relative min-w-0 flex-1 overflow-hidden rounded bg-muted/30",
                compact ? "h-5" : "h-6",
                interactive &&
                  "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              );
              // Fill (category colour) anchored left + the icon & name overlaid
              // at the left so the name reads whether or not it fits inside the
              // fill. The count sits in a fixed right-hand column.
              const barInner = (
                <>
                  <span
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ width: `${pct.toFixed(2)}%`, backgroundColor: colorVar }}
                    aria-hidden="true"
                  />
                  <span className="absolute inset-0 flex items-center gap-1.5 px-2">
                    <Icon className="size-3.5 shrink-0 text-foreground" />
                    <span className="truncate text-[11px] font-medium text-foreground">
                      {d.type}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={d.type} className="flex items-center gap-2">
                  {interactive ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectType(d.type);
                      }}
                      aria-label={`View ${d.count.toLocaleString()} ${d.type} ${title} events`}
                      className={barCls}
                    >
                      {barInner}
                    </button>
                  ) : (
                    <div className={barCls}>{barInner}</div>
                  )}
                  <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
                    {d.count.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
