"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Map, MapRoute, type MapRef } from "@/components/ui/map";
import { filterValidLonLatPairs } from "@/lib/map-coordinates";
import { cn } from "@/lib/utils";

export type ScheduleStatus = "planned" | "in_progress" | "completed" | "cancelled";

type ScheduleItem = {
  id: string;
  rangerName: string;
  status: string;
  plannedTrackGeojson?: unknown;
  patrolArea: { id: string; name: string } | null;
};

type Props<T extends ScheduleItem> = {
  items: T[];
  onSelect: (item: T) => void;
};

const DEFAULT_CENTER: [number, number] = [121.05, 13.15]; // Mindoro AOI
const DEFAULT_ZOOM = 9;

const STATUS_COLOR: Record<ScheduleStatus, string> = {
  planned: "#3b82f6", // blue-500
  in_progress: "#f59e0b", // amber-500
  completed: "#22c55e", // green-500
  cancelled: "#6b7280", // gray-500
};

function isValidStatus(value: string): value is ScheduleStatus {
  return value in STATUS_COLOR;
}

function extractCoordinates(value: unknown): [number, number][] | null {
  if (value === null || typeof value !== "object" || !("geometry" in value)) {
    return null;
  }
  const geometry = value.geometry;
  if (geometry === null || typeof geometry !== "object" || !("coordinates" in geometry)) {
    return null;
  }
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords as [number, number][];
}

export function MapView<T extends ScheduleItem>({ items, onSelect }: Props<T>) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const didFitRef = useRef(false);

  const withTracks = useMemo(
    () =>
      items
        .map((item) => ({ item, coordinates: extractCoordinates(item.plannedTrackGeojson) }))
        .filter(
          (entry): entry is { item: T; coordinates: [number, number][] } =>
            entry.coordinates !== null,
        ),
    [items],
  );
  const withoutTracks = useMemo(
    () => items.filter((item) => extractCoordinates(item.plannedTrackGeojson) === null),
    [items],
  );

  // MAP GEOMETRY ONLY — (0,0)/non-finite/out-of-domain vertices are excluded
  // from the auto-fit so one bad planned-track point can't stretch the camera
  // across the planet. The routes themselves still draw from `withTracks`
  // unfiltered, and no schedule row is hidden from the list.
  const allCoordinates = useMemo(
    () => filterValidLonLatPairs(withTracks.flatMap((entry) => entry.coordinates)),
    [withTracks],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || didFitRef.current || allCoordinates.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const c of allCoordinates) bounds.extend(c);
    map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 });
    didFitRef.current = true;
  }, [allCoordinates]);

  return (
    <div
      className="flex flex-col gap-2 lg:flex-row"
      data-testid="patrol-schedule-map-view"
    >
      <div
        className="relative min-h-[420px] flex-1 overflow-hidden rounded-lg border"
        data-testid="patrol-schedule-map-container"
      >
        <Map ref={mapRef} center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full">
          {withTracks.map(({ item, coordinates }) => {
            const status = isValidStatus(item.status) ? item.status : "planned";
            return (
              <MapRoute
                key={item.id}
                id={`patrol-schedule-track-${item.id}`}
                coordinates={coordinates}
                color={STATUS_COLOR[status]}
                width={selectedId === item.id ? 5 : 3}
                opacity={selectedId === null || selectedId === item.id ? 0.9 : 0.35}
                onClick={() => {
                  setSelectedId(item.id);
                  onSelect(item);
                }}
              />
            );
          })}
        </Map>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-md border bg-background/95 p-2 text-xs shadow-md backdrop-blur">
          {(Object.keys(STATUS_COLOR) as ScheduleStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[status] }}
                aria-hidden="true"
              />
              <span className="capitalize">{status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="w-full space-y-1.5 lg:w-64"
        data-testid="patrol-schedule-map-no-track-panel"
      >
        <p className="text-xs font-medium text-muted-foreground">
          No track drawn ({withoutTracks.length})
        </p>
        <ul className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border p-1.5">
          {withoutTracks.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => { onSelect(item); }}
                data-testid={`patrol-schedule-map-no-track-${item.id}`}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent",
                )}
              >
                <span className="truncate">{item.rangerName}</span>
                <span className="text-muted-foreground">
                  {item.patrolArea?.name ?? "No area"}
                </span>
              </button>
            </li>
          ))}
          {withoutTracks.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">
              Every schedule has a planned track.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
