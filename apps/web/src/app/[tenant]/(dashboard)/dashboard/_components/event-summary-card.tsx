"use client";

import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelectedMonthEvent } from "./events-this-month-panel";

/**
 * Compact geo-anchored event summary card (Q3 — Command Center map).
 *
 * Rendered as the `content` of a `MapPopup` (InteractiveMap.tsx `detailPopup`
 * prop) when an "Events This Month" panel row is clicked. Pure props —
 * summary fields come straight from the event.list row already fetched by
 * the panel (no event.getById call). Kept intentionally tight (`w-56`) since
 * it sits inside a map popup, not a full page panel. The MapPopup shell
 * itself is transparent/unstyled (globals.css strips maplibre's popup
 * chrome), so this card owns its own shadcn Card shell.
 */
export interface EventSummaryCardProps {
  event: SelectedMonthEvent;
  onClose: () => void;
}

function formatStatus(state: string): string {
  return state
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function EventSummaryCard({ event, onClose }: EventSummaryCardProps) {
  const dateLabel =
    event.reportedAt == null
      ? "—"
      : new Date(event.reportedAt).toLocaleString();

  return (
    <Card className="w-56 max-w-xs gap-2 py-3 shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-2 px-3">
        <CardTitle className="text-sm leading-tight">
          {event.displayTitle}
        </CardTitle>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </CardHeader>
      <CardContent className="px-3">
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="text-right font-medium">
              {event.eventTypeDisplay ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="text-right font-medium">{dateLabel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Area</dt>
            <dd className="text-right font-medium">{event.areaName ?? "—"}</dd>
          </div>
          {event.offenderName != null && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Offender</dt>
              <dd className="text-right font-medium">{event.offenderName}</dd>
            </div>
          )}
          {event.vesselName != null && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Vessel</dt>
              <dd className="text-right font-medium">{event.vesselName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium">
              {formatStatus(event.state)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
