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
import { MapHeatmap } from "./MapHeatmap";
import { PatrolSelector } from "./PatrolSelector";
import { TrackLegend } from "./TrackLegend";
import {
  DEFAULT_TRACK_VISIBILITY,
  filterVisibleTracks,
  patrolTrackStyle,
  type PatrolTrackVisibility,
  type PatrolType,
} from "./patrolTrackStyle";
import {
  EVENT_CATEGORY,
  eventCategoryColor,
  eventCategoryHeatHsl,
  eventPrioritySizePx,
  eventPriorityLabel,
} from "./eventMarkerStyle";

// MapLibre coordinate convention is [longitude, latitude] (locked in DECISIONS_LOG).
// Default view spans Marine Guardian's primary operating area; the map auto-fits
// to the actual loaded data bounds once features arrive (see fit-bounds effect).
const DEFAULT_CENTER: [number, number] = [121.5, 13.0];
const DEFAULT_ZOOM = 6;

// Event-layer toggles (2026-06-27): event markers are grouped by the same REAL
// EarthRanger eventType.category buckets the dashboard breakdown uses. Both
// default OFF — patrol tracks (foot + seaborne) are the always-on baseline and
// event layers are manually triggered by the operator. EVENT_CATEGORY +
// marker colour/size/label helpers live in ./eventMarkerStyle (imported above).
type EventLayerVisibility = { lawEnforcement: boolean; monitoring: boolean };
const DEFAULT_EVENT_LAYERS: EventLayerVisibility = {
  lawEnforcement: false,
  monitoring: false,
};

type InteractiveMapProps = {
  className?: string;
  /**
   * Optional War Room FROM/TO window (2026-06-27). When supplied (Command
   * Center), the event markers are filtered to events reported within the
   * range so the map stays consistent with the dashboard breakdown / feed.
   * Omitted on the standalone Live Map, which shows the live (unfiltered) set.
   * Ranger positions + active patrol tracks are always live (not date-filtered).
   */
  dateFrom?: Date;
  dateTo?: Date;
  /** Optional municipality filter (Interactive Report Map). When supplied, event
   *  markers AND (in inRange track mode) patrol tracks are scoped to it. */
  municipalityId?: string;
  /**
   * Patrol-track overlay source (2026-06-27):
   *   "active"  (default) — most-recent patrols' tracks, live (Command Center /
   *              Live Map). Not date- or municipality-filtered.
   *   "inRange"           — tracks whose patrol started within [dateFrom,dateTo]
   *              and (optionally) the municipality (Interactive Report Map), so
   *              the tracks follow the same filter as the markers + charts.
   */
  trackMode?: "active" | "inRange";
  /** Initial event display mode (Interactive Report Map): "dots" (default) renders
   *  individual category-coloured markers; "heatmap" renders per-category density
   *  surfaces. The in-map TrackLegend toggle flips this at runtime. */
  displayMode?: "dots" | "heatmap";
  /** Hide the single-patrol drill-down selector overlay (report map = events-focused). */
  hidePatrolSelector?: boolean;
  /** When provided, event markers become clickable and call this with the event id
   *  (report map opens the EventDetailModal from a marker click). */
  onEventClick?: (eventId: string) => void;
};

export function InteractiveMap({
  className,
  dateFrom,
  dateTo,
  municipalityId,
  trackMode = "active",
  displayMode: initialDisplayMode = "dots",
  hidePatrolSelector,
  onEventClick,
}: InteractiveMapProps) {
  const subjectsQuery = trpc.map.subjects.list.useQuery();
  const eventsQuery = trpc.map.events.list.useQuery({
    ...(dateFrom !== undefined ? { from: dateFrom } : {}),
    ...(dateTo !== undefined ? { to: dateTo } : {}),
    ...(municipalityId !== undefined ? { municipalityId } : {}),
  });
  const patrolAreasQuery = trpc.map.patrolAreas.list.useQuery({
    activeOnly: true,
  });

  const [selectedPatrolId, setSelectedPatrolId] = useState<string | null>(null);
  const patrolTracksQuery = trpc.map.patrolTracks.byPatrolId.useQuery(
    { patrolId: selectedPatrolId ?? "" },
    { enabled: selectedPatrolId !== null },
  );

  // Track overlay source. Both queries are declared (hooks must be
  // unconditional) but only the active mode runs its query — the other is
  // disabled so it never fires.
  const useInRangeTracks = trackMode === "inRange";
  const activeTracksQuery = trpc.map.patrolTracks.active.useQuery(undefined, {
    enabled: !useInRangeTracks,
  });
  const inRangeTracksQuery = trpc.map.patrolTracks.inRange.useQuery(
    {
      ...(dateFrom !== undefined ? { from: dateFrom } : {}),
      ...(dateTo !== undefined ? { to: dateTo } : {}),
      ...(municipalityId !== undefined ? { municipalityId } : {}),
    },
    { enabled: useInRangeTracks },
  );
  const tracksData = useInRangeTracks
    ? inRangeTracksQuery.data
    : activeTracksQuery.data;
  const [showTracks, setShowTracks] = useState(true);
  const [trackVisibility, setTrackVisibility] = useState<PatrolTrackVisibility>(
    DEFAULT_TRACK_VISIBILITY,
  );
  // Event-marker layers — both OFF by default (operator-triggered).
  const [eventLayers, setEventLayers] = useState<EventLayerVisibility>(
    DEFAULT_EVENT_LAYERS,
  );
  // Event display mode (dots vs heatmap) — seeded from the prop, flipped via the
  // TrackLegend toggle.
  const [displayMode, setDisplayMode] = useState<"dots" | "heatmap">(
    initialDisplayMode,
  );

  const visibleTracks = useMemo(
    () =>
      filterVisibleTracks(
        tracksData?.tracks ?? [],
        showTracks,
        trackVisibility,
      ),
    [tracksData, showTracks, trackVisibility],
  );

  const subjects = (subjectsQuery.data ?? []).filter(
    (s): s is typeof s & { lastPositionLat: number; lastPositionLon: number } =>
      s.lastPositionLat !== null && s.lastPositionLon !== null,
  );
  const events = eventsQuery.data ?? [];

  // Only render event markers whose category bucket is toggled on. Events that
  // are neither law-enforcement nor monitoring (uncategorised / analyzer) are
  // hidden — matching the dashboard breakdown, which buckets only these two.
  const visibleEvents = useMemo(
    () =>
      events.filter((e) => {
        const cat = e.eventType?.category;
        if (cat === EVENT_CATEGORY.lawEnforcement)
          return eventLayers.lawEnforcement;
        if (cat === EVENT_CATEGORY.monitoring) return eventLayers.monitoring;
        return false;
      }),
    [events, eventLayers],
  );

  // Per-category point sets for the Heatmap display mode (each gated by the same
  // law/monitoring layer toggle as the dot markers).
  const lawHeatPoints = useMemo(
    () =>
      eventLayers.lawEnforcement
        ? events
            .filter(
              (e) =>
                e.eventType?.category === EVENT_CATEGORY.lawEnforcement &&
                e.locationLon != null &&
                e.locationLat != null,
            )
            .map((e) => ({
              lon: e.locationLon as number,
              lat: e.locationLat as number,
            }))
        : [],
    [events, eventLayers.lawEnforcement],
  );
  const monHeatPoints = useMemo(
    () =>
      eventLayers.monitoring
        ? events
            .filter(
              (e) =>
                e.eventType?.category === EVENT_CATEGORY.monitoring &&
                e.locationLon != null &&
                e.locationLat != null,
            )
            .map((e) => ({
              lon: e.locationLon as number,
              lat: e.locationLat as number,
            }))
        : [],
    [events, eventLayers.monitoring],
  );

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
    <div className={cn("flex h-full w-full flex-col gap-2", className)}>
      {/* Patrol-track toggles live in a horizontal bar ABOVE the map (not
          overlaid inside it), aligned to the map width. */}
      <TrackLegend
        orientation="horizontal"
        showTracks={showTracks}
        onShowTracksChange={setShowTracks}
        visibility={trackVisibility}
        onTypeVisibilityChange={(type: PatrolType, next: boolean) => {
          setTrackVisibility((prev) => ({ ...prev, [type]: next }));
        }}
        eventLayers={eventLayers}
        onEventLayerChange={(layer, next) => {
          setEventLayers((prev) => ({ ...prev, [layer]: next }));
        }}
        {...(useInRangeTracks
          ? { displayMode, onDisplayModeChange: setDisplayMode }
          : {})}
        className="shrink-0"
      />

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
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

        {/* Heatmap display mode: per-category density surfaces (each gated by
            its layer toggle). Concrete HSL ramps match the dot-marker colours. */}
        {displayMode === "heatmap" && (
          <>
            {lawHeatPoints.length > 0 && (
              <MapHeatmap
                id="events-law"
                points={lawHeatPoints}
                hsl={eventCategoryHeatHsl(EVENT_CATEGORY.lawEnforcement)}
              />
            )}
            {monHeatPoints.length > 0 && (
              <MapHeatmap
                id="events-monitoring"
                points={monHeatPoints}
                hsl={eventCategoryHeatHsl(EVENT_CATEGORY.monitoring)}
              />
            )}
          </>
        )}

        {displayMode === "dots" &&
          visibleEvents.map((event) => {
          const size = eventPrioritySizePx(event.priority);
          return (
            <MapMarker
              key={`event-${event.id}`}
              longitude={event.locationLon as number}
              latitude={event.locationLat as number}
              {...(onEventClick
                ? {
                    onClick: () => {
                      onEventClick(event.id);
                    },
                  }
                : {})}
            >
              <MarkerContent>
                <div
                  className={cn(
                    "rotate-45 border border-white shadow-lg",
                    onEventClick !== undefined && "cursor-pointer",
                  )}
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: eventCategoryColor(event.eventType?.category),
                  }}
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
          );
        })}
      </Map>

        {hidePatrolSelector !== true && (
          <div className="absolute top-4 left-4 z-10 max-w-xs">
            <PatrolSelector
              value={selectedPatrolId}
              onChange={setSelectedPatrolId}
              className="bg-background/95 backdrop-blur shadow-md"
            />
          </div>
        )}
      </div>
    </div>
  );
}
