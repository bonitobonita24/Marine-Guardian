"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerTooltip,
  type MapRef,
} from "@/components/ui/map";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { MapPolygon } from "./MapPolygon";
import { PatrolSelector } from "./PatrolSelector";
import { TrackLegend } from "./TrackLegend";
import {
  DEFAULT_TRACK_VISIBILITY,
  filterVisibleTracks,
  patrolTrackStyle,
  type PatrolTrackVisibility,
  type PatrolType,
} from "./patrolTrackStyle";

// MapLibre coordinate convention is [longitude, latitude] (locked in DECISIONS_LOG).
// Default view spans Marine Guardian's primary operating area; the map auto-fits
// to the actual loaded data bounds once features arrive (see fit-bounds effect).
const DEFAULT_CENTER: [number, number] = [121.5, 13.0];
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
  const patrolAreasQuery = trpc.map.patrolAreas.list.useQuery({
    activeOnly: true,
  });

  const [selectedPatrolId, setSelectedPatrolId] = useState<string | null>(null);
  const patrolTracksQuery = trpc.map.patrolTracks.byPatrolId.useQuery(
    { patrolId: selectedPatrolId ?? "" },
    { enabled: selectedPatrolId !== null },
  );

  // All-active-tracks overlay: every open patrol's track, styled by type.
  const activeTracksQuery = trpc.map.patrolTracks.active.useQuery();
  const [showTracks, setShowTracks] = useState(true);
  const [trackVisibility, setTrackVisibility] = useState<PatrolTrackVisibility>(
    DEFAULT_TRACK_VISIBILITY,
  );

  const visibleTracks = useMemo(
    () =>
      filterVisibleTracks(
        activeTracksQuery.data?.tracks ?? [],
        showTracks,
        trackVisibility,
      ),
    [activeTracksQuery.data, showTracks, trackVisibility],
  );

  const subjects = (subjectsQuery.data ?? []).filter(
    (s): s is typeof s & { lastPositionLat: number; lastPositionLon: number } =>
      s.lastPositionLat !== null && s.lastPositionLon !== null,
  );
  const events = eventsQuery.data ?? [];

  const trackCoordinates: [number, number][] = (
    patrolTracksQuery.data?.points ?? []
  ).map((p) => [p.lon, p.lat]);

  const mapRef = useRef<MapRef>(null);
  // Track whether we've already auto-fit to the initial dataset so manual
  // panning isn't overridden on every query refetch.
  const didFitInitialRef = useRef(false);

  // All point coordinates from the loaded data, used to auto-fit the viewport.
  const dataCoordinates = useMemo<[number, number][]>(() => {
    const coords: [number, number][] = [];
    for (const s of subjects) coords.push([s.lastPositionLon, s.lastPositionLat]);
    for (const e of events) {
      if (e.locationLon != null && e.locationLat != null) {
        coords.push([e.locationLon, e.locationLat]);
      }
    }
    return coords;
  }, [subjects, events]);

  // Auto-fit the map to the data bounds once features have loaded, so the
  // viewport always lands on where the real EarthRanger data actually is
  // rather than a hardcoded center.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || didFitInitialRef.current || dataCoordinates.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const c of dataCoordinates) bounds.extend(c);
    map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 0 });
    didFitInitialRef.current = true;
  }, [dataCoordinates]);

  // When a patrol track is selected, fly to its extent.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || trackCoordinates.length < 2) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const c of trackCoordinates) bounds.extend(c);
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 });
  }, [trackCoordinates]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <Map
        ref={mapRef}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
      >
        <MapControls />

        {(patrolAreasQuery.data ?? []).map((area) => (
          <MapPolygon
            key={`patrol-area-${area.id}`}
            id={`patrol-area-${area.id}`}
            geojson={
              area.polygonGeojson as unknown as
                | GeoJSON.Polygon
                | GeoJSON.MultiPolygon
            }
            color={area.colorHex}
          />
        ))}

        {/* All-active-tracks overlay: one polyline per open patrol, styled by
            patrol type (seaborne solid/cyan, foot dashed/orange). */}
        {visibleTracks.map((track) => {
          const style = patrolTrackStyle(track.patrolType);
          const coordinates: [number, number][] = track.points.map((p) => [
            p.lon,
            p.lat,
          ]);
          return (
            <MapRoute
              key={`active-track-${track.patrolId}`}
              id={`active-track-${track.patrolId}`}
              coordinates={coordinates}
              color={style.color}
              width={style.width}
              opacity={style.opacity}
              {...(style.dashArray ? { dashArray: style.dashArray } : {})}
            />
          );
        })}

        {/* Selected single patrol track (drill-down via PatrolSelector). */}
        {trackCoordinates.length >= 2 && (
          <MapRoute
            id="selected-patrol-track"
            coordinates={trackCoordinates}
            color="#2563eb"
            width={3}
            opacity={0.85}
          />
        )}

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

      <div className="absolute top-4 left-4 z-10 max-w-xs">
        <PatrolSelector
          value={selectedPatrolId}
          onChange={setSelectedPatrolId}
          className="bg-background/95 backdrop-blur shadow-md"
        />
      </div>

      <div className="absolute right-4 bottom-4 z-10 w-56">
        <TrackLegend
          showTracks={showTracks}
          onShowTracksChange={setShowTracks}
          visibility={trackVisibility}
          onTypeVisibilityChange={(type: PatrolType, next: boolean) => {
            setTrackVisibility((prev) => ({ ...prev, [type]: next }));
          }}
        />
      </div>
    </div>
  );
}
