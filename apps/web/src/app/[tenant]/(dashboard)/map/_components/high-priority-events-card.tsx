"use client";

import { AlertTriangle, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  locationLat: number | null;
  locationLon: number | null;
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
  onLocate,
}: {
  events: HighPriorityEvent[];
  total: number;
  isLoading: boolean;
  onSelect: (eventId: string) => void;
  /** Fly the Report Map to this event's coordinate (the row "locate" button). */
  onLocate: (lat: number, lon: number) => void;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-1 flex-col gap-2 border-border py-2">
      <CardHeader className="flex flex-row items-stretch justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
          {/* Same glyph the map uses for serious / high-priority events. */}
          <AlertTriangle
            className="size-3.5 shrink-0"
            style={{ color: "hsl(var(--destructive))" }}
            aria-hidden="true"
          />
          <CardTitle className="min-w-0 flex-1 text-xs uppercase leading-tight tracking-wide text-foreground/85">
            High Priority Events
          </CardTitle>
        </div>
        <div
          className="w-px shrink-0 self-stretch bg-border"
          aria-hidden="true"
        />
        <Badge variant="secondary" className="shrink-0 self-center tabular-nums">
          {total.toLocaleString()}
        </Badge>
      </CardHeader>

      {/* relative + an absolutely-positioned scroll list: the list is taken out
          of flow so its (long) content never drives the grid-row height — the
          card then stretches to match its siblings in the analytics band rather
          than being capped to a hardcoded height. */}
      <CardContent className="relative min-h-0 flex-1 px-0 pb-1 pt-0">
        {isLoading ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            No high-priority events in this range.
          </p>
        ) : (
          <ul className="absolute inset-0 overflow-y-auto">
            {events.map((e) => {
              const label = e.typeDisplay ?? e.title ?? "Event";
              const Icon = eventTypeIcon(e.typeDisplay, e.category);
              const lat = e.locationLat;
              const lon = e.locationLon;
              const hasCoords = lat !== null && lon !== null;
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1 hover:bg-muted/30"
                >
                  {/* Row body — one horizontal line: type icon, name, municipality,
                      date. Click opens the shared EventDetailModal. */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(e.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {/* Bare category-coloured glyph — no circle chip (owner
                        request 2026-06-28): just the icon in its category colour. */}
                    <Icon
                      className="size-4 shrink-0"
                      style={{ color: eventCategoryColor(e.category) }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {label}
                    </span>
                    <span className="max-w-[5rem] shrink-0 truncate text-xs text-muted-foreground">
                      {e.municipalityName ?? "Unassigned"}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDate(e.reportedAt)}
                    </span>
                  </button>
                  {/* Locate button — flies the map to this event's exact point. */}
                  {hasCoords ? (
                    <button
                      type="button"
                      onClick={() => {
                        // lat/lon are narrowed to number inside the hasCoords branch.
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
