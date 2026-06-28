"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { eventCategoryColor } from "@/components/map/eventMarkerStyle";
import { eventTypeIcon } from "@/lib/event-type-icon";

/**
 * Interactive Report Map — High Priority Events list (replaces the Municipality
 * Coverage chart, 2026-06-28). Lists "serious incident" events (the same types
 * flagged with the red marker on the map — see reportMap.highPriorityEvents)
 * within the selected date range + municipality scope. Each row opens the shared
 * EventDetailModal via onSelect. Scrollable; the card scrollbar is hidden by the
 * .command-center styles but scrolls on wheel/keyboard.
 */

export type HighPriorityEvent = {
  id: string;
  title: string | null;
  priority: number;
  reportedAt: Date | string | null;
  typeDisplay: string | null;
  category: string | null;
  municipalityName: string | null;
};

function formatDate(value: Date | string | null): string {
  if (value === null) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function HighPriorityEventsCard({
  events,
  total,
  isLoading,
  onSelect,
}: {
  events: HighPriorityEvent[];
  total: number;
  isLoading: boolean;
  onSelect: (eventId: string) => void;
}) {
  return (
    <Card className="flex h-full max-h-[11rem] min-w-0 flex-1 flex-col gap-2 border-border py-2">
      <CardHeader className="flex flex-row items-stretch justify-between gap-2 border-b px-3 py-1.5">
        <h3 className="min-w-0 flex-1 self-center text-[10px] font-bold uppercase leading-tight tracking-wider text-foreground/85">
          High Priority Events
        </h3>
        <div
          className="w-px shrink-0 self-stretch bg-border"
          aria-hidden="true"
        />
        <span className="shrink-0 self-center text-sm font-bold tabular-nums">
          {total.toLocaleString()}
        </span>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-1 pt-0">
        {isLoading ? (
          <p className="px-3 py-3 text-[10px] text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="px-3 py-3 text-[10px] text-muted-foreground">
            No high-priority events in this range.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {events.map((e) => {
              const label = e.typeDisplay ?? e.title ?? "Event";
              const Icon = eventTypeIcon(e.typeDisplay, e.category);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(e.id);
                    }}
                    className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: eventCategoryColor(e.category) }}
                      aria-hidden="true"
                    >
                      <Icon className="size-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-foreground">
                        {label}
                      </span>
                      <span className="block truncate text-[9px] text-muted-foreground">
                        {e.municipalityName ?? "Unassigned"} ·{" "}
                        {formatDate(e.reportedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
