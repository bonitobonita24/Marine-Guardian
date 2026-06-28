"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  isSeriousEvent,
} from "./eventMarkerStyle";
import { isImageAsset } from "@marine-guardian/shared/lib/asset-mime";
import { eventTypeIcon } from "@/lib/event-type-icon";
import { AlertTriangle } from "lucide-react";

// MapLibre coordinate convention is [longitude, latitude] (locked in DECISIONS_LOG).
// Default view spans Marine Guardian's primary operating area; the map auto-fits
// to the actual loaded data bounds once features arrive (see fit-bounds effect).
const DEFAULT_CENTER: [number, number] = [121.5, 13.0];
const DEFAULT_ZOOM = 6;

// Event pins stay small when zoomed out; the small image-preview thumbnail
// (for events that have a photo) only appears once zoomed in past this level.
const PIN_PREVIEW_ZOOM = 11.5;

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
  /** Hide live ranger/subject position markers. The Interactive Report Map is a
   *  date/municipality-scoped reporting surface — it must show ONLY the filtered
   *  events + patrol tracks, never live (unfiltered) ranger GPS positions. */
  hideSubjects?: boolean;
  /** When provided, event markers become clickable and call this with the event id
   *  (report map opens the EventDetailModal from a marker click). */
  onEventClick?: (eventId: string) => void;
  /** Control placement. "bar" (default) = horizontal legend toolbar ABOVE the
   *  map (Command Center / Live Map — unchanged). "floating" = all controls in a
   *  single collapsible card overlaid on the map's upper-left, giving the map the
   *  full panel height (Interactive Report Map). */
  controlsPlacement?: "bar" | "floating";
  /** Slot rendered at the top of the floating controls card (date + municipality
   *  filters). Only used when controlsPlacement="floating". */
  filterSlot?: ReactNode;
  /** Fly the map to a specific point (Interactive Report Map — the High Priority
   *  Events list "locate" button). `key` bumps on every click so re-clicking the
   *  same event re-triggers the flyTo. Null = no focus requested. */
  focusLocation?: { lon: number; lat: number; key: number } | null;
};

export function InteractiveMap({
  className,
  dateFrom,
  dateTo,
  municipalityId,
  trackMode = "active",
  displayMode: initialDisplayMode = "dots",
  hidePatrolSelector,
  hideSubjects,
  onEventClick,
  controlsPlacement = "bar",
  filterSlot,
  focusLocation,
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
  // Current map zoom — drives zoom-responsive event-pin sizing + image previews.
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

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
    if (hideSubjects !== true) {
      for (const s of subjects)
        coords.push([s.lastPositionLon, s.lastPositionLat]);
    }
    for (const e of events) {
      if (e.locationLon != null && e.locationLat != null) {
        coords.push([e.locationLon, e.locationLat]);
      }
    }
    return coords;
  }, [subjects, events, hideSubjects]);

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

  // "Locate on map" from the High Priority Events list — fly to the clicked
  // event's exact coordinate. `focusLocation.key` changes on every click so
  // re-clicking the same event re-runs the flyTo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusLocation) return;
    map.flyTo({
      center: [focusLocation.lon, focusLocation.lat],
      zoom: 14,
      duration: 1200,
    });
  }, [focusLocation]);

  const floating = controlsPlacement === "floating";
  return (
    <div className={cn("flex h-full w-full flex-col gap-2", className)}>
      {/* Bar mode (Command Center / Live Map): horizontal legend toolbar ABOVE
          the map, aligned to the map width. */}
      {!floating && (
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
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
      {/* Floating mode (Interactive Report Map): every control in one compact,
          collapsible card overlaid on the map's upper-left → the map gets the
          full panel height. */}
      {floating && (
        <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-60 max-w-[calc(100%-1.5rem)] flex-col">
          <TrackLegend
            orientation="vertical"
            collapsible
            title="Map controls"
            className="min-h-0"
            {...(filterSlot !== undefined ? { header: filterSlot } : {})}
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
          />
        </div>
      )}
      <Map
        ref={mapRef}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        onViewportChange={(vp) => {
          // onViewportChange fires CONTINUOUSLY on pan + zoom. Only commit a new
          // zoom when it changes enough to matter (≥ 0.25), and bail out (return
          // prev → React skips the re-render) on pure pans. Updating state on
          // every frame re-rendered the map children and was tearing down the
          // patrol-track layers + event-marker click handlers mid-interaction.
          setZoom((prev) => (Math.abs(prev - vp.zoom) >= 0.25 ? vp.zoom : prev));
        }}
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

        {hideSubjects !== true &&
          subjects.map((subject) => (
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
          const serious = isSeriousEvent(event.eventType?.display);
          const color = eventCategoryColor(event.eventType?.category);
          const ringColor = serious ? "hsl(var(--destructive))" : color;
          // Per-event-type glyph (owner request 2026-06-28). Shown at every zoom:
          // in the marker chip when zoomed out / no image, and beside the photo
          // thumbnail when zoomed in on an event that has an image.
          const Icon = eventTypeIcon(
            event.eventType?.display,
            event.eventType?.category,
          );
          // Pins shrink when zoomed out so a dense range never blankets the map.
          const zoomScale = zoom < 9 ? 0.6 : zoom < PIN_PREVIEW_ZOOM ? 0.85 : 1;
          const size = Math.round(
            (serious ? eventPrioritySizePx(event.priority) + 6 : eventPrioritySizePx(event.priority)) *
              zoomScale,
          );
          // Image preview only once zoomed in past the threshold AND the event
          // actually has an image asset.
          const firstImage =
            zoom >= PIN_PREVIEW_ZOOM
              ? event.assets.find((a) => isImageAsset(a.mimeType, a.filename))
              : undefined;
          const clickable = onEventClick !== undefined;
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
                {firstImage ? (
                  // Zoomed-in: the event-type icon chip sits BESIDE the photo
                  // preview thumbnail (owner request). Ring = category colour,
                  // or red for serious events, with a corner alert badge.
                  <div
                    className={cn(
                      "flex items-center gap-1",
                      clickable && "cursor-pointer",
                    )}
                  >
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-white text-white shadow"
                      style={{ backgroundColor: ringColor }}
                      aria-hidden="true"
                    >
                      <Icon className="size-3" />
                    </span>
                    <div
                      className="relative overflow-hidden rounded-md border-2 shadow-lg"
                      style={{ width: 40, height: 40, borderColor: ringColor }}
                    >
                      <img
                        src={`/api/assets/${firstImage.id}`}
                        alt={event.title ?? "Event photo"}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {serious && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--destructive))] text-white shadow">
                          <AlertTriangle className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                ) : serious ? (
                  // Distinct, attention-drawing marker for serious incidents:
                  // pulsing red circle carrying the event-type glyph.
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full border-2 border-white bg-[hsl(var(--destructive))] text-white shadow-lg animate-warroom-pulse",
                      clickable && "cursor-pointer",
                    )}
                    style={{
                      width: Math.max(size, 22),
                      height: Math.max(size, 22),
                    }}
                  >
                    <Icon className="h-[60%] w-[60%]" />
                  </div>
                ) : (
                  // Routine event: the event-type glyph in a category-coloured
                  // chip. Floored at 16px so the icon stays legible even when
                  // zoomed far out (owner request — icons visible at every zoom).
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full border border-white text-white shadow-lg",
                      clickable && "cursor-pointer",
                    )}
                    style={{
                      width: Math.max(size, 16),
                      height: Math.max(size, 16),
                      backgroundColor: color,
                    }}
                  >
                    <Icon className="h-[62%] w-[62%]" />
                  </div>
                )}
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
