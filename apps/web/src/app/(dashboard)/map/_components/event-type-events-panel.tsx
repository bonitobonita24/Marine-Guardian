"use client";

import { useEffect, useRef } from "react";
import { MapPin, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { eventTypeIcon } from "@/lib/event-type-icon";

/**
 * Interactive Report Map — floating event-type drill-down panel (2026-07-06).
 * Rendered in the map's upper-RIGHT (InteractiveMap's topRightSlot, same slot
 * as SelectedPatrolMapPanel — the two are mutually exclusive) when a Law
 * Enforcement / Monitoring breakdown bar is clicked (see BreakdownBars
 * onSelectType, wired in report-map-view.tsx). Lists every event of that one
 * type in the current filtered range; each row opens the shared
 * EventDetailModal (onSelectEvent) and/or flies the map to its coordinate
 * (onLocate) — mirrors HighPriorityEventsCard's row layout. Dismissed by the
 * X button, Escape, or re-clicking the same bar (handled by the caller).
 */

export type EventTypeEventsPanelEvent = {
  id: string;
  title: string | null;
  typeDisplay: string;
  reportedAt: Date | string | null;
  municipalityName: string | null;
  lat: number | null;
  lon: number | null;
};

function formatDate(value: Date | string | null): string {
  if (value === null) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function EventTypeEventsPanel({
  display,
  events,
  onLocate,
  onSelectEvent,
  onClose,
}: {
  /** The clicked event-type label (eventType.display) — the panel heading. */
  display: string;
  events: EventTypeEventsPanelEvent[];
  /** Fly the Report Map to this event's coordinate (row "locate" button). */
  onLocate: (lat: number, lon: number) => void;
  /** Open the shared EventDetailModal for this event. */
  onSelectEvent: (eventId: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // WCAG: move focus into the panel when it appears (same pattern as
  // SelectedPatrolMapPanel) so keyboard users land on the list they requested.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Esc dismisses the panel wherever focus currently is. Radix dialogs (the
  // event-detail modal) preventDefault the Escape they consume — the guard
  // keeps a single Esc from closing both surfaces at once.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const Icon = eventTypeIcon(display);

  return (
    <Card
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={`${display} events`}
      className="gap-0 border-primary/40 bg-background/95 py-0 shadow-md backdrop-blur focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <CardHeader className="flex flex-row items-center gap-1.5 space-y-0 border-b px-3 py-2">
        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          {display}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {events.length.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${display} events`}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {events.length === 0 ? (
          <p className="px-3 py-3 text-[10px] text-muted-foreground">
            No {display} events in this range.
          </p>
        ) : (
          <ul>
            {events.map((e) => {
              const label = e.title ?? e.typeDisplay;
              const lat = e.lat;
              const lon = e.lon;
              const hasCoords = lat !== null && lon !== null;
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1 last:border-b-0 hover:bg-muted/30"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectEvent(e.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                      {label}
                    </span>
                    <span className="max-w-[5rem] shrink-0 truncate text-[9px] text-muted-foreground">
                      {e.municipalityName ?? "Unassigned"}
                    </span>
                    <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                      {formatDate(e.reportedAt)}
                    </span>
                  </button>
                  {hasCoords ? (
                    <button
                      type="button"
                      onClick={() => {
                        onLocate(lat, lon);
                      }}
                      aria-label={`Show ${label} on the map`}
                      title="Show on map"
                      className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <MapPin className="size-3.5" />
                    </button>
                  ) : (
                    <span
                      className="grid size-6 shrink-0 place-items-center text-muted-foreground/30"
                      title="No location for this event"
                      aria-hidden="true"
                    >
                      <MapPin className="size-3.5" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
