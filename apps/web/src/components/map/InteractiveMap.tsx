"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import maplibregl from "maplibre-gl";
import {
  Map,
  MapControls,
  MapMarker,
  MapPopup,
  MapRoute,
  MarkerContent,
  MarkerTooltip,
  type MapRef,
} from "@/components/ui/map";
import { trpc } from "@/lib/trpc/client";
import {
  filterValidLonLatPairs,
  isValidMapCoordinate,
} from "@/lib/map-coordinates";
import { cn } from "@/lib/utils";
import { MapPolygon } from "./MapPolygon";
import { MapTopRightColumn } from "./MapTopRightColumn";
import { MapHeatmap } from "./MapHeatmap";
import { PatrolSelector } from "./PatrolSelector";
import { TrackLegend } from "./TrackLegend";
import { DoodleOverlay } from "./doodle/DoodleOverlay";
import { DoodleToolbar } from "./doodle/DoodleToolbar";
import { useDoodle } from "./doodle/useDoodle";
import {
  DEFAULT_TRACK_VISIBILITY,
  filterVisibleTracks,
  gridDedupeTrackPoints,
  patrolTrackStyle,
  patrolTrackHeatHsl,
  type PatrolTrackVisibility,
  type PatrolType,
} from "./patrolTrackStyle";
import {
  EVENT_CATEGORY,
  eventCategoryColor,
  eventCategoryHeatHsl,
  eventPrioritySizePx,
  eventTypeValueKey,
  isEventVisible,
  isSeriousEvent,
  type EventFilterState,
} from "./eventMarkerStyle";
import { isSubjectVisible } from "./subjectVisibility";
import { MAP_LAYER } from "./mapLayers";
import { isImageAsset } from "@marine-guardian/shared/lib/asset-mime";
import { eventTypeIcon } from "@/lib/event-type-icon";
import { AlertTriangle, Flag, FlagTriangleRight, Pencil } from "lucide-react";

// MapLibre coordinate convention is [longitude, latitude] (locked in DECISIONS_LOG).
// Default view spans Marine Guardian's primary operating area; the map auto-fits
// to the actual loaded data bounds once features arrive (see fit-bounds effect).
const DEFAULT_CENTER: [number, number] = [121.5, 13.0];
const DEFAULT_ZOOM = 6;

/* ---------------------------------------------------------------------------
 * ZOOM / DOODLE CLUSTER PLACEMENT — floating ("Interactive Report Map") mode
 * ---------------------------------------------------------------------------
 * Owner request 2026-07-20: park the zoom + doodle controls immediately to the
 * RIGHT of the "MAP CONTROLS" card, top-aligned with it, with a small gap —
 * and INDEPENDENT of it, so they do not move when MAP CONTROLS collapses.
 * Independence is why these are absolute insets on the MAP rather than DOM
 * children of the card: the card's own height/collapse state cannot reach them.
 *
 * DERIVATION (do not hardcode a bare pixel number — recompute from these):
 *   MAP CONTROLS column  = `left-3` (0.75rem) + `w-48` (12rem) below `lg`
 *                                             + `w-60` (15rem) at `lg` and up
 *   gap                  = 0.75rem (12px), matching the card's own left inset
 *
 *   below lg : 0.75 + 12 + 0.75 = 13.5rem (216px)
 *   lg and up: 0.75 + 15 + 0.75 = 16.5rem (264px)
 *
 * The responsive step is load-bearing: MAP CONTROLS narrows by 3rem below
 * `lg`, so a single fixed offset would leave a ~60px hole there. Both values
 * are derived from the SAME width classes on the column literal below — if
 * that column's width changes, change these together.
 */
const CONTROL_CLUSTER_BESIDE_MAP_CONTROLS =
  "top-3 left-[13.5rem] lg:left-[17.5rem]";

/**
 * The doodle toggle stacks directly beneath the zoom group, in the same
 * column, matching the cluster's own `gap-1.5`:
 *   top-3 (0.75rem) + zoom ControlGroup height + 0.375rem gap
 *   zoom group = two `size-8` (2rem) buttons + the group's 1px top/bottom
 *                border + the 1px divider between them ≈ 4.1875rem
 *   0.75 + 4.1875 + 0.375 = 5.3125rem
 * Rounded to `top-[5.3125rem]`. Same left offsets as the cluster.
 */
const DOODLE_TOGGLE_BESIDE_MAP_CONTROLS =
  "top-[5.3125rem] left-[13.5rem] lg:left-[17.5rem]";

/** "Xh YYm" duration string for the traversing-coverage summary line, or "—"
 *  when the figure is unavailable. Mirrors formatPatrolHours in
 *  patrol-list-by-range-card.tsx (kept local — this is a shared/, not app/,
 *  component). */
function formatCoverageHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  const totalMin = Math.round(hours * 60);
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${String(hr)}h ${String(min).padStart(2, "0")}m`;
}

// Event pins stay small when zoomed out; the small image-preview thumbnail
// (for events that have a photo) only appears once zoomed in past this level.
const PIN_PREVIEW_ZOOM = 11.5;

// Official coverage boundary line styling, by kind (derived server-side from the
// AreaBoundary provenance key). Thin outlines; MPAs get a heavier line + faint
// fill so protected zones read as distinct from municipal land/water rings.
// All coverage boundaries render as a neutral grey DOTTED line (round-cap
// dasharray) — the OpenStreetMap-style muted boundary look — so they read
// distinctly as "boundary lines" versus the solid coloured patrol tracks /
// area polygons. MPAs keep a slightly heavier line + faint fill so protected
// zones still stand out a touch, but the colour is uniformly grey.
const BOUNDARY_COLOR = "#9ca3af"; // grey-400 — visible on the dark map
const BOUNDARY_DASH = [0, 2]; // MapLibre dotted recipe (with round caps)

// Patrol-track heatmap tuning. Grid-deduped tracks (gridDedupeTrackPoints) feed
// a deliberately LOW per-point weight so a single pass reads faint in its
// category colour (cyan/orange) and heat only escalates toward red where
// SEPARATE patrols overlap the same ground — i.e. colour intensity = how many
// times an area was patrolled. Event heatmaps keep the MapHeatmap defaults
// (one event should already register), so this override is patrol-track only.
// weight 0.04 tuned live on the real map (zoom 6.6 regional + zoom 9 municipal):
// a single grid-deduped pass then reads as its faint category colour and heat
// only climbs to orange→red where separate patrols overlap the same ground.
const TRACK_HEAT_TUNING = { weight: 0.04, intensity: 1, radius: 22 } as const;

// Event heatmap tuning. Events are discrete points (not dense tracks), so unlike
// patrol tracks a single event SHOULD register on its own — a touch larger than
// the base default so a lone event reads as a clear mark, with a slightly raised
// weight so neighbouring events blend into a growing, combined hot blob (→ red)
// as they cluster. radius 40 (was 34) — nudged wider so near-neighbour events
// keep merging into one blob as you zoom in, rather than separating into isolated
// dots. Density→red ramp itself lives in MapHeatmap.
const EVENT_HEAT_TUNING = { weight: 1.2, intensity: 1.2, radius: 40 } as const;
const BOUNDARY_STYLE: Record<
  "land" | "water" | "mpa",
  { color: string; outlineWidth: number; fillOpacity: number; outlineOpacity: number; dashArray: number[] }
> = {
  land: { color: BOUNDARY_COLOR, outlineWidth: 2, fillOpacity: 0, outlineOpacity: 0.6, dashArray: BOUNDARY_DASH },
  water: { color: BOUNDARY_COLOR, outlineWidth: 2, fillOpacity: 0, outlineOpacity: 0.6, dashArray: BOUNDARY_DASH },
  mpa: { color: BOUNDARY_COLOR, outlineWidth: 2.5, fillOpacity: 0.04, outlineOpacity: 0.8, dashArray: BOUNDARY_DASH },
};

/**
 * Flatten every [lon, lat] coordinate out of a Polygon / MultiPolygon geometry
 * so callers can union them into a LngLatBounds. Tolerant of the loosely-typed
 * geometryGeojson coming back from the official-boundaries query: it walks the
 * nested coordinate arrays and yields only well-formed numeric pairs.
 */
function geometryCoordinates(geometry: unknown): [number, number][] {
  const out: [number, number][] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      out.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  if (typeof geometry === "object" && geometry !== null) {
    walk((geometry as { coordinates?: unknown }).coordinates);
  }
  return out;
}

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
  /** Optional MPA-scope filter (Interactive Report Map). When supplied, event
   *  markers AND (in inRange track mode) patrol tracks are narrowed to events /
   *  patrols that fall inside the given protected zone. */
  protectedZoneId?: string;
  /** Optional province rollup filter (Interactive Report Map, 2026-07-09).
   *  When supplied (and `municipalityId` is not), event markers AND (in
   *  inRange track mode) patrol tracks are narrowed to every municipality
   *  within the given province. */
  province?: string;
  /** Optional "include child boundaries" toggle (Interactive Report Map,
   *  Phase 4B, 2026-07-09). When true (and the report is municipality-scoped),
   *  event markers AND (in inRange track mode) patrol tracks attributed to
   *  that municipality's child protected zones (MPA/hotspot/custom) are
   *  folded in alongside the municipality's own directly-attributed rows. */
  includeChildren?: boolean;
  /** Optional "include traversing patrols" toggle (Interactive Report Map).
   *  When true (and the report is scoped to a single municipality, in
   *  `inRange` track mode), patrols that merely TRAVERSE that municipality
   *  (pass through without starting there) are folded into the returned
   *  track set alongside the municipality's directly-attributed
   *  ("started here") patrols — each returned track carries `attributed` /
   *  `traversing` / `insideKm` / `insideHoursEst` so the caller can tell
   *  them apart and render the clipped coverage. */
  includeTraversing?: boolean;
  /** Optional "count full traversing patrols" toggle (Interactive Report Map,
   *  ZONE SCOPE ONLY). When true, patrols that merely traverse the selected
   *  protected zone are still returned, but each such track's
   *  `insideKm`/`insideHoursEst` carry the patrol's FULL distance/time rather
   *  than the clipped inside-the-zone portion — superseding, never adding to,
   *  `includeTraversing`'s clipped crediting (the server enforces the
   *  exclusivity). The "Traversing coverage" readout therefore sums full
   *  patrol effort in this mode, agreeing with the KPI tiles and the PDF. */
  includeTraversingFull?: boolean;
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
  /** Initial event-layer visibility. Omitted → both categories OFF (Command
   *  Center / Live Map keep the operator-triggered default). The Interactive
   *  Report Map passes both ON so events are visible immediately on load. */
  defaultEventLayers?: EventLayerVisibility;
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
  /** Geo-anchored MapPopup summary card (Command Center "Events This Month"
   *  panel row click, Q3 2026-07-19). Rendered inside the map's `<Map>` at
   *  the given coordinates; `content` supplies the popup body. null = none. */
  detailPopup?: { lon: number; lat: number; content: ReactNode } | null;
  /** Controlled patrol selection — when provided (not undefined), the map
   *  renders this patrol's track instead of the internal PatrolSelector state.
   *  Used by the Report Map "Patrols in range" list so clicking a row draws
   *  that patrol's track. null = none selected. While a patrol is selected
   *  through THIS prop the all-tracks overlay is isolated to ONLY that
   *  patrol's track; clearing the selection restores every (toggle-visible)
   *  track. The internal PatrolSelector (uncontrolled) never isolates. */
  selectedPatrolId?: string | null;
  /** Rendered as a floating overlay in the map's upper-RIGHT corner, above the
   *  canvas — symmetric with the floating controls card on the left. The
   *  Report Map passes the selected-patrol detail panel here so it lives
   *  inside the map container (and survives fullscreen). TRANSIENT: this slot
   *  is empty until the operator selects a patrol / event type. It stacks
   *  BELOW `topRightPinnedSlot` in one shared right-hand column (see below),
   *  so an opening panel never overlaps the pinned content. Width `w-72`. */
  topRightSlot?: ReactNode;
  /** Rendered at the TOP of the same upper-RIGHT column as `topRightSlot`,
   *  above it (owner request 2026-07-20 — the Report Map's chart panel, which
   *  is top-aligned with the "Map controls" card on the left, mirroring it at
   *  `right-3 top-3`). PINNED: always present, unlike the transient slot
   *  below it. Pinned to `w-60` — the Map controls card's width — so a `w-60`
   *  pinned panel and a `w-72` transient panel still share a flush right edge
   *  in the right-anchored column. */
  topRightPinnedSlot?: ReactNode;
  /** Clicking one of the all-tracks patrol polylines calls this with its
   *  patrolId (Report Map: select that patrol from the map itself). */
  onPatrolTrackClick?: (patrolId: string) => void;
  /** Clicking the empty basemap — not a marker, not a patrol track — calls
   *  this. The Report Map uses it to clear the selected patrol (dismisses the
   *  floating panel and restores all tracks). */
  onBackgroundClick?: () => void;
  /** Names of rangers the caller considers ACTIVE (Command Center Ranger
   *  Roster — dashboard.rangerRoster status !== "idle", i.e. "on_patrol" or
   *  "active"). Paired with `hideIdleSubjects`: when true, this is an
   *  ALLOWLIST — ONLY subject markers whose `name` is in this set are kept;
   *  every other subject (idle roster rangers AND non-roster ER subjects
   *  with no KnownRanger entry at all) is hidden, so a busy war-room display
   *  isn't cluttered with anyone who isn't currently out (owner request
   *  2026-07 — "annoying to see [idle rangers] sometimes"; the previous
   *  idle-name denylist missed ~18 non-roster subjects that never appear in
   *  any idle set). Matched by name (Subject and KnownRanger are both
   *  derived from the same EarthRanger subject records but have no shared FK
   *  exposed to the client). Omitted / undefined → no filtering (every
   *  subject shown, existing behavior) as long as `hideIdleSubjects` is also
   *  false/undefined. */
  activeSubjectNames?: Set<string>;
  /** Default false (all subjects SHOWN — owner-approved default). true keeps
   *  ONLY subject markers whose name is in `activeSubjectNames`, hiding
   *  everything else. */
  hideIdleSubjects?: boolean;
  /** Enables the Doodle map-annotation overlay (freehand drawing pinned to
   *  geo coordinates, saved via trpc.doodle.create) when set. Identifies
   *  which surface a saved doodle belongs to. Omitted → no doodle UI at all
   *  (e.g. the Rangers-on-Duty drilldown map, which also reuses this
   *  component, stays unaffected). */
  doodleSurface?: "command-center" | "report-map";
};

export function InteractiveMap({
  className,
  dateFrom,
  dateTo,
  municipalityId,
  protectedZoneId,
  province,
  includeChildren,
  includeTraversing,
  includeTraversingFull,
  trackMode = "active",
  displayMode: initialDisplayMode = "dots",
  defaultEventLayers,
  hidePatrolSelector,
  hideSubjects,
  onEventClick,
  controlsPlacement = "bar",
  filterSlot,
  focusLocation,
  detailPopup,
  selectedPatrolId: controlledSelectedPatrolId,
  topRightSlot,
  topRightPinnedSlot,
  onPatrolTrackClick,
  onBackgroundClick,
  activeSubjectNames,
  hideIdleSubjects,
  doodleSurface,
}: InteractiveMapProps) {
  const doodle = useDoodle();
  // Skylight opt-in (SKY-1). Default OFF — Skylight events stay excluded from
  // the map's events unless the operator toggles this on (TrackLegend "Show
  // Skylight events" switch, wired below).
  const [showSkylight, setShowSkylight] = useState(false);
  // Event photo-preview thumbnails (image markers, zoomed-in). Default ON —
  // when the operator toggles this off (TrackLegend "Photo thumbnails"
  // switch), every event collapses to its plain icon-chip marker.
  const [showThumbnails, setShowThumbnails] = useState(true);
  const subjectsQuery = trpc.map.subjects.list.useQuery();
  const eventsQuery = trpc.map.events.list.useQuery({
    ...(dateFrom !== undefined ? { from: dateFrom } : {}),
    ...(dateTo !== undefined ? { to: dateTo } : {}),
    ...(municipalityId !== undefined ? { municipalityId } : {}),
    ...(protectedZoneId !== undefined ? { protectedZoneId } : {}),
    ...(province !== undefined ? { province } : {}),
    ...(includeChildren !== undefined ? { includeChildren } : {}),
    ...(showSkylight ? { includeSkylight: true } : {}),
  });
  const patrolAreasQuery = trpc.map.patrolAreas.list.useQuery({
    activeOnly: true,
  });
  // Official coverage boundaries (municipality land/water + MPA outlines),
  // imported into AreaBoundary (source=official). Rendered as thin lines behind
  // a controls toggle. Distinct from patrolAreas (drawn patrol zones).
  const officialBoundariesQuery = trpc.map.officialBoundaries.list.useQuery();
  // Specific event types per category, for the hierarchical map-controls toggle
  // tree (floating Report Map controls only — the horizontal CC/Live Map legend
  // keeps just the category master toggles, so the query is gated to floating).
  const floatingControls = controlsPlacement === "floating";
  const eventTypesQuery = trpc.map.eventTypes.byCategory.useQuery(undefined, {
    enabled: floatingControls,
  });

  const [internalSelectedPatrolId, setSelectedPatrolId] = useState<string | null>(null);
  // Controlled override (Report Map list) wins over the internal PatrolSelector.
  const selectedPatrolId =
    controlledSelectedPatrolId !== undefined
      ? controlledSelectedPatrolId
      : internalSelectedPatrolId;
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
      ...(protectedZoneId !== undefined ? { protectedZoneId } : {}),
      ...(province !== undefined ? { province } : {}),
      ...(includeChildren !== undefined ? { includeChildren } : {}),
      ...(includeTraversing !== undefined ? { includeTraversing } : {}),
      ...(includeTraversingFull !== undefined ? { includeTraversingFull } : {}),
    },
    { enabled: useInRangeTracks },
  );
  const tracksData = useInRangeTracks
    ? inRangeTracksQuery.data
    : activeTracksQuery.data;
  const [showTracks, setShowTracks] = useState(true);
  // Official coverage boundary overlay (municipality land/water + MPA). Default
  // ON — the owner's headline ask is to see the boundaries; the toggle lets an
  // operator hide them to declutter.
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [trackVisibility, setTrackVisibility] = useState<PatrolTrackVisibility>(
    DEFAULT_TRACK_VISIBILITY,
  );
  // Event-marker layers. Default OFF (operator-triggered) on the Command Center
  // / Live Map; the Interactive Report Map passes `defaultEventLayers` both-ON
  // so event markers are visible immediately on load (owner request 2026-06-28).
  const [eventLayers, setEventLayers] = useState<EventLayerVisibility>(
    defaultEventLayers ?? DEFAULT_EVENT_LAYERS,
  );
  // Per-type opt-OUT set for the hierarchical controls (2026-06-29). A type is
  // shown unless its id is in here, so the default (empty set) shows every type
  // under its enabled category — no need to seed from the types query. Toggling a
  // specific type off adds its id; toggling back on removes it.
  const [disabledTypeIds, setDisabledTypeIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const handleTypeToggle = useCallback((typeId: string, next: boolean) => {
    setDisabledTypeIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.delete(typeId);
      else updated.add(typeId);
      return updated;
    });
  }, []);
  // Per-VALUE opt-OUT set for the L3 sub-type toggles (2026-06-29). Keyed
  // `${typeId}::${normalizedValue}` so identical value labels under different
  // event types never collide. Empty default → every L3 value shown under its
  // enabled type. Toggling a value off adds its key; back on removes it.
  const [disabledTypeValues, setDisabledTypeValues] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const handleTypeValueToggle = useCallback((key: string, next: boolean) => {
    setDisabledTypeValues((prev) => {
      const updated = new Set(prev);
      if (next) updated.delete(key);
      else updated.add(key);
      return updated;
    });
  }, []);
  // Event display mode (dots vs heatmap) — seeded from the prop, flipped via the
  // TrackLegend toggle.
  const [displayMode, setDisplayMode] = useState<"dots" | "heatmap">(
    initialDisplayMode,
  );
  // Patrol-track display mode (Interactive Report Map): line overlay
  // (default) vs a density heatmap of the currently-visible tracks, split by
  // patrol type so seaborne/foot stay color-distinct. Local, mirrors
  // `displayMode` above; only surfaced via TrackLegend on the inRange path.
  const [showTrackHeatmap, setShowTrackHeatmap] = useState(false);
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

  // Traversing coverage (2026-07-16): when includeTraversing is on, sum the
  // clipped in-municipality distance/time of every returned track flagged
  // `traversing` (passes THROUGH the selected municipality without starting
  // there). Summed over ALL returned tracks (not just toggle-visible ones —
  // this is a coverage total, independent of which patrol-type lines are
  // currently shown), and deliberately excluded from the existing
  // "started here" / attributed patrol count elsewhere on the page — a
  // traversing patrol is coverage, not a patrol counted as based here.
  const traversingCoverage = useMemo(() => {
    // Only the `inRange` query's response carries attributed/traversing/
    // insideKm/insideHoursEst — read directly from it (not the merged
    // `tracksData`, whose type unions with the `active` query's plain shape
    // and would lose these fields).
    // Full mode also returns traversing tracks (with FULL distance/time in
    // insideKm/insideHoursEst), so the readout must not vanish when only the
    // full-traversing toggle is on.
    if (
      (includeTraversing !== true && includeTraversingFull !== true) ||
      !useInRangeTracks
    )
      return null;
    const tracks = inRangeTracksQuery.data?.tracks ?? [];
    let km = 0;
    let hours = 0;
    let count = 0;
    for (const t of tracks) {
      if (!t.traversing) continue;
      km += t.insideKm;
      hours += t.insideHoursEst;
      count += 1;
    }
    if (count === 0) return null;
    return { km, hours, count };
  }, [
    includeTraversing,
    includeTraversingFull,
    useInRangeTracks,
    inRangeTracksQuery.data,
  ]);

  // Selected-patrol track isolation (2026-07-03): while a patrol is selected
  // via the CONTROLLED prop (Report Map list / track click), the all-tracks
  // overlay shows ONLY that patrol's track so it reads clearly against the
  // basemap; deselecting restores every toggle-visible track. Deliberately
  // keyed to the controlled id, NOT the merged selection: the Command Center /
  // Live Map internal PatrolSelector drill-down must keep showing every other
  // live track (war-room situational awareness), exactly as before. Per-type
  // styling / legend / toggles are untouched.
  const displayedTracks = useMemo(
    () =>
      controlledSelectedPatrolId != null
        ? visibleTracks.filter((t) => t.patrolId === controlledSelectedPatrolId)
        : visibleTracks,
    [visibleTracks, controlledSelectedPatrolId],
  );

  // Per-patrol-type point sets for the track-heatmap toggle, flattened from
  // the SAME `displayedTracks` the line overlay renders — so the heatmap only
  // ever shows what the lines would (visibility toggles + selected-patrol
  // isolation already applied).
  // Grid-dedupe each track before flattening (gridDedupeTrackPoints): a single
  // pass then contributes ~1 point per cell, so heat intensity reflects how
  // many DISTINCT patrols overlapped an area (repetition) rather than how
  // densely one track was GPS-sampled. Without this a lone track saturates the
  // heatmap to red and the repeated-coverage signal is lost.
  const seaborneHeatPoints = useMemo(
    () =>
      displayedTracks
        .filter((t) => t.patrolType === "seaborne")
        .flatMap((t) => gridDedupeTrackPoints(t.points)),
    [displayedTracks],
  );
  const footHeatPoints = useMemo(
    () =>
      displayedTracks
        .filter((t) => t.patrolType === "foot")
        .flatMap((t) => gridDedupeTrackPoints(t.points)),
    [displayedTracks],
  );

  // Start/finish flag markers (2026-07-04): the endpoints of whichever track
  // is currently the "selected patrol" line — the controlled Report Map
  // selection (displayedTracks, already isolated to one patrol) or the
  // internal CC PatrolSelector drill-down (patrolTracksQuery). Both maps
  // share this component, so deriving the endpoints here renders the flags
  // on both without extra wiring.
  const flagCoordinates = useMemo(() => {
    const points =
      controlledSelectedPatrolId != null
        ? displayedTracks[0]?.points
        : patrolTracksQuery.data?.points;
    if (points === undefined || points.length < 2) return null;
    const first = points[0];
    const last = points[points.length - 1];
    if (first === undefined || last === undefined) return null;
    return {
      start: [first.lon, first.lat] as [number, number],
      finish: [last.lon, last.lat] as [number, number],
    };
  }, [controlledSelectedPatrolId, displayedTracks, patrolTracksQuery.data]);

  const subjects = (subjectsQuery.data ?? [])
    .filter(
      (s): s is typeof s & { lastPositionLat: number; lastPositionLon: number } =>
        s.lastPositionLat !== null && s.lastPositionLon !== null,
    )
    .filter((s) => isSubjectVisible(s.name, hideIdleSubjects, activeSubjectNames));
  const events = eventsQuery.data ?? [];

  // The shared L1+L2+L3 marker/heatmap predicate state (category layers, the
  // opted-out type ids, and the opted-out `${typeId}::${value}` keys).
  const eventFilter: EventFilterState = useMemo(
    () => ({ eventLayers, disabledTypeIds, disabledTypeValues, showSkylight }),
    [eventLayers, disabledTypeIds, disabledTypeValues, showSkylight],
  );

  // Visible markers: category bucket on AND L2 type on AND L3 value on. Events
  // that are neither law-enforcement nor monitoring are hidden — matching the
  // dashboard breakdown, which buckets only these two. Both the dot markers and
  // the heatmap surfaces derive from this same filtered set so they stay
  // perfectly consistent.
  const visibleEvents = useMemo(
    () => events.filter((e) => isEventVisible(e, eventFilter)),
    [events, eventFilter],
  );

  // In-range marker count per event-type id (≤200 loaded events) for the L2
  // badge.
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const id = e.eventType?.id;
      if (id != null) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  // In-range marker count per `${typeId}::${value}` key for the L3 badge.
  const typeValueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const id = e.eventType?.id;
      if (id == null) continue;
      const key = eventTypeValueKey(id, e.eventTypeValue);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  // Per-category point sets for the Heatmap display mode, split out of the SAME
  // visible set as the dot markers so heatmap + dots filter identically.
  const lawHeatPoints = useMemo(
    () =>
      visibleEvents
        .filter(
          (e) =>
            e.eventType?.category === EVENT_CATEGORY.lawEnforcement &&
            e.locationLon != null &&
            e.locationLat != null,
        )
        .map((e) => ({
          lon: e.locationLon as number,
          lat: e.locationLat as number,
        })),
    [visibleEvents],
  );
  const monHeatPoints = useMemo(
    () =>
      visibleEvents
        .filter(
          (e) =>
            e.eventType?.category === EVENT_CATEGORY.monitoring &&
            e.locationLon != null &&
            e.locationLat != null,
        )
        .map((e) => ({
          lon: e.locationLon as number,
          lat: e.locationLat as number,
        })),
    [visibleEvents],
  );

  // Memoized so the reference is stable across re-renders (e.g. zoom updates
  // the `zoom` state → re-render). Without this, the fit-to-track effect below
  // (dep: [trackCoordinates]) re-ran on EVERY render and snapped the camera
  // back to the track extent — making the map feel "zoom-locked" whenever a
  // patrol was selected (owner bug 2026-07-06).
  // MAP GEOMETRY ONLY — (0,0)/non-finite/out-of-domain vertices are dropped so
  // one bad track point can't stretch the fly-to extent across the planet. The
  // rendered track layer draws from the query data directly and is unaffected.
  const trackCoordinates = useMemo<[number, number][]>(
    () =>
      filterValidLonLatPairs(
        (patrolTracksQuery.data?.points ?? []).map(
          (p) => [p.lon, p.lat] as [number, number],
        ),
      ),
    [patrolTracksQuery.data],
  );

  const mapRef = useRef<MapRef | null>(null);
  // The map instance is also mirrored into state: effects that must bind map
  // listeners as soon as the map exists (background-click deselect below)
  // can't rely on mapRef.current — the ref is populated after this
  // component's mount effects have already run. The callback ref keeps both
  // in sync.
  const [mapInstance, setMapInstance] = useState<MapRef | null>(null);
  const attachMapRef = useCallback((m: MapRef | null) => {
    mapRef.current = m;
    setMapInstance(m);
  }, []);
  // Track whether we've already auto-fit to the initial dataset so manual
  // panning isn't overridden on every query refetch.
  const didFitInitialRef = useRef(false);

  // All point coordinates from the loaded data, used to auto-fit the viewport.
  //
  // MAP GEOMETRY ONLY: coordinates that cannot legitimately frame a camera —
  // (0,0) "Null Island", non-finite, outside the WGS84 domain — are excluded
  // here (see lib/map-coordinates.ts). Four (0,0) event rows exist in the dev
  // DB; including them stretched the auto-fit from West Africa to Mindoro and
  // left the real cluster an unreadable speck. The events themselves are NOT
  // filtered: they still appear in `events`, in every count, list and card on
  // this page, and in the marker layer below.
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
    return filterValidLonLatPairs(coords);
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

  // When a municipality is selected (Report Map filter), fly the map to fit
  // that municipality's full official extent — its land + derived water
  // boundaries combined. The official boundaries carry their source
  // municipalityId, so we union every coordinate of the matching boundaries
  // into one bounds and fitBounds to it. Owner ask 2026-06-29: selecting a
  // municipality should frame it on the map.
  const officialBoundaries = officialBoundariesQuery.data;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || municipalityId === undefined || !officialBoundaries) return;
    const matching = officialBoundaries.filter(
      (b) => b.municipalityId === municipalityId,
    );
    if (matching.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    let extended = false;
    for (const b of matching) {
      for (const [lon, lat] of geometryCoordinates(b.geometryGeojson)) {
        // MAP GEOMETRY ONLY — skip (0,0)/non-finite/out-of-domain vertices so a
        // malformed boundary upload can't blow this municipality's frame open
        // to a hemisphere. The boundary itself still renders and still drives
        // attribution and coverage math.
        if (!isValidMapCoordinate(lat, lon)) continue;
        bounds.extend([lon, lat]);
        extended = true;
      }
    }
    // No usable vertex → leave the current view alone rather than fitting an
    // empty LngLatBounds (which throws in maplibre).
    if (!extended) return;
    map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 800 });
  }, [municipalityId, officialBoundaries]);

  // Background-click deselect (2026-07-03): a click on the empty basemap —
  // NOT on a marker (markers are DOM overlays, so their clicks bubble to the
  // map with a non-canvas target) and NOT on/near a patrol-track line — calls
  // onBackgroundClick so the Report Map can clear the selected patrol. Track
  // proximity is checked with a small padded box so a near-miss on a thin
  // 3px line doesn't read as "empty map".
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onBackgroundClickRef.current = onBackgroundClick;
  const backgroundClickEnabled = onBackgroundClick !== undefined;
  useEffect(() => {
    const map = mapInstance;
    if (!map || !backgroundClickEnabled) return;
    const TRACK_HIT_PAD = 6; // px around the click point counted as "on a track"
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.target !== map.getCanvas()) return;
      const hitBox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - TRACK_HIT_PAD, e.point.y - TRACK_HIT_PAD],
        [e.point.x + TRACK_HIT_PAD, e.point.y + TRACK_HIT_PAD],
      ];
      const onTrack = map
        .queryRenderedFeatures(hitBox)
        .some(
          (f) =>
            f.layer.id.startsWith("route-layer-active-track-") ||
            f.layer.id === "route-layer-selected-patrol-track",
        );
      if (onTrack) return;
      onBackgroundClickRef.current?.();
    };
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [mapInstance, backgroundClickEnabled]);

  const floating = floatingControls;
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
          showBoundaries={showBoundaries}
          onShowBoundariesChange={setShowBoundaries}
          showSkylight={showSkylight}
          onShowSkylightChange={setShowSkylight}
          showThumbnails={showThumbnails}
          onShowThumbnailsChange={setShowThumbnails}
          {...(useInRangeTracks
            ? {
                displayMode,
                onDisplayModeChange: setDisplayMode,
                showTrackHeatmap,
                onShowTrackHeatmapChange: setShowTrackHeatmap,
              }
            : {})}
          className="shrink-0"
        />
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
      {/* Floating mode (Interactive Report Map): every control in one compact,
          collapsible card overlaid on the map's upper-left → the map gets the
          full panel height. */}
      {floating && (
        /* Responsive width (regression fix 2026-07-20): this column and the
           upper-RIGHT column were both hard `w-60` (240px), which made them
           collide from ~730px viewport downward (see MapTopRightColumn for the
           measured numbers and the full rationale). Below `lg` it steps down to
           `w-48` and is capped at 60% of the map, so the map stays the dominant
           surface and the card's own collapse button remains reachable without
           first dismissing anything. Every `lg:` value is the pre-regression
           value verbatim — >= 1024px is pixel-identical to before. */
        <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-48 max-w-[60%] flex-col lg:w-64 lg:max-w-[calc(100%-1.5rem)]">
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
            showBoundaries={showBoundaries}
            onShowBoundariesChange={setShowBoundaries}
            showSkylight={showSkylight}
            onShowSkylightChange={setShowSkylight}
            showThumbnails={showThumbnails}
            onShowThumbnailsChange={setShowThumbnails}
            {...(eventTypesQuery.data !== undefined
              ? { eventTypesByCategory: eventTypesQuery.data }
              : {})}
            disabledTypeIds={disabledTypeIds}
            onTypeToggle={handleTypeToggle}
            typeCounts={typeCounts}
            disabledTypeValues={disabledTypeValues}
            onTypeValueToggle={handleTypeValueToggle}
            typeValueCounts={typeValueCounts}
            {...(useInRangeTracks
              ? {
                  displayMode,
                  onDisplayModeChange: setDisplayMode,
                  showTrackHeatmap,
                  onShowTrackHeatmapChange: setShowTrackHeatmap,
                }
              : {})}
          />
          {/* Traversing coverage summary (2026-07-16) — shown only while
              includeTraversing is on AND at least one traversing track was
              returned. Deliberately separate from the "started here" patrol
              count elsewhere on the page: this is COVERAGE (clipped
              distance/time of patrols passing through, not based in, the
              selected municipality), never folded into a patrol count. */}
          {traversingCoverage !== null && (
            <div
              data-testid="traversing-coverage-summary"
              className="mt-2 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur"
            >
              Traversing coverage: +{traversingCoverage.km.toFixed(1)} km ·{" "}
              +{formatCoverageHours(traversingCoverage.hours)} hrs (est.)
            </div>
          )}
        </div>
      )}
      {/* Upper-right floating column — mirrors the upper-left controls column
          at `right-3 top-3`. The pinned chart panel and the transient
          patrol/event-type panels share this ONE stacking column (see
          MapTopRightColumn for the full collision-resolution rationale). */}
      <MapTopRightColumn
        {...(topRightPinnedSlot != null ? { pinned: topRightPinnedSlot } : {})}
        {...(topRightSlot != null ? { transient: topRightSlot } : {})}
      />
      <Map
        ref={attachMapRef}
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
        {/* `className` is merged LAST inside MapControls (twMerge), so
            MAP_LAYER.control overrides the primitive's default z-10 and lifts
            the zoom cluster above the full-bleed doodle canvas. Without this
            the canvas (painted later, equal z) swallowed every zoom click
            while doodle mode was on. */}
        <MapControls
          className={MAP_LAYER.control}
          {...(floating
            ? { positionClassName: CONTROL_CLUSTER_BESIDE_MAP_CONTROLS }
            : {})}
        />

        {/* Doodle mode toggle — alongside the existing zoom/compass controls
            (both on MAP_LAYER.control, above the doodle canvas so this button
            can always be used to LEAVE doodle mode). Only rendered when the
            caller opts a surface in via
            `doodleSurface` (Command Center / Report Map); other consumers of
            this shared component (e.g. the Rangers-on-Duty drilldown map)
            never render it.

            In `floating` mode it joins the relocated cluster: same left
            offset, stacked directly under the zoom group (see
            DOODLE_TOGGLE_BESIDE_MAP_CONTROLS). In bar mode it keeps its
            original bottom-right slot. */}
        {doodleSurface !== undefined && (
          <div
            className={cn(
              "border-border bg-background absolute flex flex-col overflow-hidden rounded-md border shadow-sm",
              MAP_LAYER.control,
              floating
                ? DOODLE_TOGGLE_BESIDE_MAP_CONTROLS
                : "bottom-24 right-2",
            )}
          >
            <button
              type="button"
              onClick={doodle.toggleActive}
              aria-label={doodle.active ? "Exit doodle mode" : "Doodle on map"}
              aria-pressed={doodle.active}
              className={cn(
                "flex size-8 items-center justify-center transition-all",
                "hover:bg-accent dark:hover:bg-accent/40",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
              )}
            >
              <Pencil
                className={cn("size-4", doodle.active && "text-primary")}
              />
            </button>
          </div>
        )}

        {/* Doodle drawing surface — a portaled child of the map (see
            DoodleOverlay), pinned to geo coordinates so strokes stay put on
            pan/zoom. Full-bleed (`absolute inset-0`), so it MUST stay on the
            lowest floating layer (MAP_LAYER.doodleCanvas) — the panels
            (MAP_LAYER.panel) and control clusters (MAP_LAYER.control) sit
            above it and stay clickable. See mapLayers.ts. */}
        {doodleSurface !== undefined && (
          <DoodleOverlay
            active={doodle.active}
            color={doodle.color}
            thickness={doodle.thickness}
            strokes={doodle.strokes}
            onStrokesChange={doodle.setStrokes}
          />
        )}

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

        {/* Official coverage boundaries (municipality land/water + MPA outlines),
            thin lines styled per kind. Toggleable via the controls. */}
        {showBoundaries &&
          (officialBoundariesQuery.data ?? []).map((b) => {
            const style = BOUNDARY_STYLE[b.kind];
            return (
              <MapPolygon
                key={`boundary-${b.id}`}
                id={`boundary-${b.id}`}
                geojson={
                  b.geometryGeojson as unknown as
                    | GeoJSON.Polygon
                    | GeoJSON.MultiPolygon
                }
                color={style.color}
                fillOpacity={style.fillOpacity}
                outlineOpacity={style.outlineOpacity}
                outlineWidth={style.outlineWidth}
                dashArray={style.dashArray}
              />
            );
          })}

        {/* All-active-tracks overlay: one polyline per open patrol, styled by
            patrol type (seaborne solid/cyan, foot dashed/orange). Isolated to
            the selected patrol's track while one is selected (displayedTracks).
            Clicking a polyline selects its patrol when the parent wires
            onPatrolTrackClick. Hidden while the track heatmap is on (below) so
            the two views don't overlap — toggle-reversible. */}
        {!showTrackHeatmap && displayedTracks.map((track) => {
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
              {...(onPatrolTrackClick
                ? {
                    onClick: () => {
                      onPatrolTrackClick(track.patrolId);
                    },
                  }
                : {})}
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

        {/* Start / finish flags for the selected patrol's track (owner
            request 2026-07-04) — green flag at the first recorded point,
            checkered flag at the last. Shared across the Report Map
            (controlled selection) and the Command Center (PatrolSelector
            drill-down) via flagCoordinates above. */}
        {flagCoordinates !== null && (
          <>
            <MapMarker
              longitude={flagCoordinates.start[0]}
              latitude={flagCoordinates.start[1]}
            >
              <MarkerContent>
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-600 shadow-lg">
                  <Flag className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                </div>
              </MarkerContent>
              <MarkerTooltip>
                <div className="font-medium">Patrol start</div>
              </MarkerTooltip>
            </MapMarker>
            <MapMarker
              longitude={flagCoordinates.finish[0]}
              latitude={flagCoordinates.finish[1]}
            >
              <MarkerContent>
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 shadow-lg">
                  <FlagTriangleRight
                    className="h-3.5 w-3.5 text-white"
                    aria-hidden="true"
                  />
                </div>
              </MarkerContent>
              <MarkerTooltip>
                <div className="font-medium">Patrol end</div>
              </MarkerTooltip>
            </MapMarker>
          </>
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

        {/* Patrol-track heatmap: density surfaces for the currently-visible
            tracks, split by patrol type so seaborne (cyan) and foot (orange)
            stay color-distinct in heat form. Replaces the polyline overlay
            above while on. */}
        {showTrackHeatmap && (
          <>
            {seaborneHeatPoints.length > 0 && (
              <MapHeatmap
                id="tracks-seaborne"
                points={seaborneHeatPoints}
                hsl={patrolTrackHeatHsl("seaborne")}
                {...TRACK_HEAT_TUNING}
              />
            )}
            {footHeatPoints.length > 0 && (
              <MapHeatmap
                id="tracks-foot"
                points={footHeatPoints}
                hsl={patrolTrackHeatHsl("foot")}
                {...TRACK_HEAT_TUNING}
              />
            )}
          </>
        )}

        {/* Heatmap display mode: per-category density surfaces (each gated by
            its layer toggle). Concrete HSL ramps match the dot-marker colours. */}
        {displayMode === "heatmap" && (
          <>
            {lawHeatPoints.length > 0 && (
              <MapHeatmap
                id="events-law"
                points={lawHeatPoints}
                hsl={eventCategoryHeatHsl(EVENT_CATEGORY.lawEnforcement)}
                {...EVENT_HEAT_TUNING}
              />
            )}
            {monHeatPoints.length > 0 && (
              <MapHeatmap
                id="events-monitoring"
                points={monHeatPoints}
                hsl={eventCategoryHeatHsl(EVENT_CATEGORY.monitoring)}
                {...EVENT_HEAT_TUNING}
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
          // Image preview only when thumbnails are enabled (TrackLegend "Photo
          // thumbnails" switch, default on) AND zoomed in past the threshold
          // AND the event actually has an image asset.
          const firstImage =
            showThumbnails && zoom >= PIN_PREVIEW_ZOOM
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
                {/* Hover popup — owner request: show the event CATEGORY name and
                    its EarthRanger event ID only (the serial number visible in
                    the ER UI). No "Untitled event" title. */}
                <div className="space-y-0.5">
                  <div className="font-medium">
                    {event.eventType?.display ?? "Unknown type"}
                  </div>
                  <div className="text-[10px] opacity-75">
                    {event.serialNumber != null && event.serialNumber !== ""
                      ? `ER #${event.serialNumber}`
                      : "ER ID unavailable"}
                  </div>
                </div>
              </MarkerTooltip>
            </MapMarker>
          );
        })}
        {detailPopup != null && (
          <MapPopup
            key={`${String(detailPopup.lon)},${String(detailPopup.lat)}`}
            longitude={detailPopup.lon}
            latitude={detailPopup.lat}
            closeButton
          >
            {detailPopup.content}
          </MapPopup>
        )}
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

        {/* Doodle toolbar — shown only while doodle mode is ON. */}
        {doodleSurface !== undefined && doodle.active && (
          <DoodleToolbar
            surface={doodleSurface}
            map={mapInstance}
            color={doodle.color}
            onColorChange={doodle.setColor}
            thickness={doodle.thickness}
            onThicknessChange={doodle.setThickness}
            strokes={doodle.strokes}
            onUndo={doodle.undo}
            onClear={doodle.clear}
            onSaved={doodle.reset}
            onClose={() => {
              doodle.setActive(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
