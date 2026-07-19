"use client";

import { X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

/**
 * "Events This Month" floating list panel (Q3 — Command Center map).
 *
 * Rendered in InteractiveMap's `topRightSlot`, mirroring the shell of the
 * left-side floating "Map controls" card (TrackLegend.tsx VerticalTrackLegend
 * section). Replaces the center KpiDrilldownModal for the eventsThisMonth
 * KPI tile — see kpi-drilldown-modal.tsx (that modal no longer opens for
 * this kind).
 *
 * Row click → `onSelectEvent` is wired by the caller (page.tsx) to fly the
 * Command Center map to the event's coordinates and open a geo-anchored
 * MapPopup summary card (event-summary-card.tsx).
 */
export interface SelectedMonthEvent {
  id: string;
  lat: number;
  lon: number;
  displayTitle: string;
  eventTypeDisplay: string | null;
  reportedAt: string | Date | null;
  areaName: string | null;
  offenderName: string | null;
  vesselName: string | null;
  state: string;
}

export interface EventsThisMonthPanelProps {
  /** ISO date string — the upper bound of the month (e.g. the active War
   * Room range's `dateTo`). The lower bound (`monthStart`) is derived from
   * this exactly as kpi-drilldown-modal.tsx computes it for eventsThisMonth. */
  dateTo: string;
  onClose: () => void;
  onSelectEvent: (row: SelectedMonthEvent) => void;
}

export function EventsThisMonthPanel({
  dateTo,
  onClose,
  onSelectEvent,
}: EventsThisMonthPanelProps) {
  // Same monthStart derivation as KpiDrilldownModal's eventsThisMonth branch —
  // the first day of the calendar month containing `dateTo`.
  const monthAnchor = new Date(dateTo);
  const monthStart = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1,
  ).toISOString();

  const query = trpc.event.list.useQuery({
    dateFrom: monthStart,
    dateTo,
    limit: 100,
  });

  const items = query.data?.items ?? [];

  return (
    <section
      aria-label="Events this month"
      className="flex flex-col overflow-hidden rounded-md border bg-background/95 text-sm shadow-md backdrop-blur"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 py-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Events This Month
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-2.5 pb-2">
        {query.isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Loading events…
          </p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No events this month.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((ev) => {
              const displayTitle =
                ev.title ?? ev.eventType?.display ?? "Untitled event";
              const dateLabel =
                ev.reportedAt == null
                  ? "—"
                  : new Date(ev.reportedAt).toLocaleString();
              if (ev.locationLat == null || ev.locationLon == null) {
                return (
                  <li
                    key={ev.id}
                    className="flex flex-col gap-0.5 py-2 text-muted-foreground"
                  >
                    <span className="font-medium">{displayTitle}</span>
                    <span className="text-xs">{dateLabel}</span>
                  </li>
                );
              }
              const lat = ev.locationLat;
              const lon = ev.locationLon;
              return (
                <li key={ev.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 py-2 text-left transition-colors hover:bg-accent"
                    onClick={() => {
                      onSelectEvent({
                        id: ev.id,
                        lat,
                        lon,
                        displayTitle,
                        eventTypeDisplay: ev.eventType?.display ?? null,
                        reportedAt: ev.reportedAt,
                        areaName: ev.areaName,
                        offenderName: ev.offenderName,
                        vesselName: ev.vesselName,
                        state: ev.state,
                      });
                    }}
                  >
                    <span className="font-medium">{displayTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {dateLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
