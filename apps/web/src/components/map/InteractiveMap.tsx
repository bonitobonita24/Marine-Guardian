"use client";

import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
} from "@/components/ui/map";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// MapLibre coordinate convention is [longitude, latitude] (locked in DECISIONS_LOG).
// Banda Sea center spans Marine Guardian's primary operating area.
const BANDA_SEA_CENTER: [number, number] = [127.5, -2.5];
const DEFAULT_ZOOM = 6;

// Event.priority is a raw EarthRanger integer (0/100/200/300 = low/med/high/crit).
function eventPriorityColor(priority: number): string {
  if (priority >= 300) return "bg-red-600";
  if (priority >= 200) return "bg-orange-500";
  if (priority >= 100) return "bg-amber-400";
  return "bg-sky-400";
}

function eventPriorityLabel(priority: number): string {
  if (priority >= 300) return "Critical";
  if (priority >= 200) return "High";
  if (priority >= 100) return "Medium";
  return "Low";
}

type InteractiveMapProps = {
  className?: string;
};

export function InteractiveMap({ className }: InteractiveMapProps) {
  const subjectsQuery = trpc.map.subjects.list.useQuery();
  const eventsQuery = trpc.map.events.list.useQuery({});

  const subjects = (subjectsQuery.data ?? []).filter(
    (s): s is typeof s & { lastPositionLat: number; lastPositionLon: number } =>
      s.lastPositionLat !== null && s.lastPositionLon !== null,
  );
  const events = eventsQuery.data ?? [];

  return (
    <Map
      center={BANDA_SEA_CENTER}
      zoom={DEFAULT_ZOOM}
      className={cn("h-full w-full", className)}
    >
      <MapControls />

      {subjects.map((subject) => (
        <MapMarker
          key={`subject-${subject.id}`}
          longitude={subject.lastPositionLon}
          latitude={subject.lastPositionLat}
        >
          <MarkerContent>
            <div
              className={cn(
                "h-3 w-3 rounded-full border-2 border-white shadow-lg",
                subject.isStale ? "bg-gray-400" : "bg-emerald-500",
              )}
            />
          </MarkerContent>
          <MarkerTooltip>
            <div className="space-y-0.5">
              <div className="font-medium">{subject.name}</div>
              <div className="text-[10px] opacity-75">
                {subject.subjectType}
                {subject.isStale ? " · stale" : ""}
              </div>
            </div>
          </MarkerTooltip>
        </MapMarker>
      ))}

      {events.map((event) => (
        <MapMarker
          key={`event-${event.id}`}
          longitude={event.locationLon as number}
          latitude={event.locationLat as number}
        >
          <MarkerContent>
            <div
              className={cn(
                "h-3 w-3 rotate-45 border-2 border-white shadow-lg",
                eventPriorityColor(event.priority),
              )}
            />
          </MarkerContent>
          <MarkerTooltip>
            <div className="space-y-0.5">
              <div className="font-medium">
                {event.title ?? "Untitled event"}
              </div>
              <div className="text-[10px] opacity-75">
                {event.eventType?.display ?? "Unknown type"} ·{" "}
                {eventPriorityLabel(event.priority)}
              </div>
            </div>
          </MarkerTooltip>
        </MapMarker>
      ))}
    </Map>
  );
}
