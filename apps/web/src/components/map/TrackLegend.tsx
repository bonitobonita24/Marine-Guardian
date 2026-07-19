"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PATROL_TRACK_STYLES,
  PATROL_TRACK_TYPES,
  type PatrolTrackVisibility,
  type PatrolType,
} from "./patrolTrackStyle";
import { EVENT_CATEGORY } from "./eventMarkerStyle";
import { eventTypeIcon } from "@/lib/event-type-icon";

/** A specific L3 "Type" sub-value offered as a toggle under an event type. */
type MapTypeValueOption = { value: string; count: number };
/** A specific event type offered as a per-type toggle under its category. Carries
 *  its L3 sub-values (the ER "Type" dropdown values) when any exist. */
type MapTypeOption = {
  id: string;
  display: string;
  types?: MapTypeValueOption[];
};
/** The specific event types per filterable category (from map.eventTypes.byCategory). */
export type MapEventTypesByCategory = {
  lawEnforcement: MapTypeOption[];
  monitoring: MapTypeOption[];
};

/** Event-marker layer toggles shown after the patrol-track toggles (horizontal
 *  toolbar only). Both default OFF — events are operator-triggered. Colors match
 *  the dashboard breakdown cards (law enforcement = chart-1, monitoring = chart-2)
 *  and the swatch is a rotated diamond mirroring the map's event markers. */
type EventLayerKey = "lawEnforcement" | "monitoring";
const EVENT_LAYER_LEGEND: {
  key: EventLayerKey;
  label: string;
  color: string;
  /** The EarthRanger eventType.category this layer maps to (per-type icon fallback). */
  category: string;
}[] = [
  {
    key: "lawEnforcement",
    label: "Law enforcement",
    color: "hsl(var(--chart-1))",
    category: EVENT_CATEGORY.lawEnforcement,
  },
  {
    key: "monitoring",
    label: "Monitoring",
    color: "hsl(var(--chart-2))",
    category: EVENT_CATEGORY.monitoring,
  },
];

type TrackLegendProps = {
  /** Master show/hide for all active patrol tracks. */
  showTracks: boolean;
  onShowTracksChange: (next: boolean) => void;
  /** Per-type visibility map. */
  visibility: PatrolTrackVisibility;
  onTypeVisibilityChange: (type: PatrolType, next: boolean) => void;
  /** Event-marker layer visibility (horizontal toolbar only). */
  eventLayers?: Record<EventLayerKey, boolean>;
  onEventLayerChange?: (layer: EventLayerKey, next: boolean) => void;
  /** Hierarchical per-type toggles (floating vertical card only, 2026-06-29).
   *  The specific event types under each category; nested under the category
   *  master toggle as a collapsible sublist. A type is shown unless its id is in
   *  `disabledTypeIds`. `typeCounts` (in-range marker count per type id) renders a
   *  muted badge. Omitted on the horizontal toolbar — it keeps category toggles. */
  eventTypesByCategory?: MapEventTypesByCategory;
  disabledTypeIds?: Set<string>;
  onTypeToggle?: (typeId: string, next: boolean) => void;
  typeCounts?: Record<string, number>;
  /** L3 sub-type toggles (floating vertical card only, 2026-06-29). Revealed when
   *  an L2 type row is expanded; each filters markers + heatmap by the event's
   *  "Type" dropdown value. A value is shown unless its `${typeId}::${value}` key
   *  is in `disabledTypeValues`. `typeValueCounts` (same key) renders a muted
   *  badge. */
  disabledTypeValues?: Set<string>;
  onTypeValueToggle?: (key: string, next: boolean) => void;
  typeValueCounts?: Record<string, number>;
  /** Event display mode (Interactive Report Map): individual dots vs density
   *  heatmap. When provided (horizontal toolbar only), a Dots⇄Heatmap toggle is
   *  shown. Off = "dots" (default), on = "heatmap". */
  displayMode?: "dots" | "heatmap";
  onDisplayModeChange?: (next: "dots" | "heatmap") => void;
  /** Patrol-track display mode (Interactive Report Map): line overlay vs a
   *  density heatmap of the currently-visible tracks, color-distinguished by
   *  patrol type (seaborne = cyan, foot = orange). When provided, a toggle is
   *  shown inside the patrol-tracks group. Off = lines (default), on = heat. */
  showTrackHeatmap?: boolean;
  onShowTrackHeatmapChange?: (next: boolean) => void;
  /** Official coverage boundary overlay (municipality land/water + MPA outlines).
   *  Master show/hide; rendered on both orientations when provided. */
  showBoundaries?: boolean;
  onShowBoundariesChange?: (next: boolean) => void;
  /** Skylight automated vessel-detection events (SKY-1). Default OFF — Skylight
   *  is excluded from the map's events unless the operator opts in. Rendered on
   *  both orientations when provided (Interactive Report Map). */
  showSkylight?: boolean;
  onShowSkylightChange?: (next: boolean) => void;
  /** Event photo-preview thumbnails (image markers, zoomed-in). Default ON —
   *  when off, every event collapses to its plain icon-chip marker. Rendered on
   *  both orientations when provided. */
  showThumbnails?: boolean;
  onShowThumbnailsChange?: (next: boolean) => void;
  /** "vertical" stacked card (overlay) or "horizontal" toolbar row (above map). */
  orientation?: "vertical" | "horizontal";
  /** Floating vertical card only: slot rendered at the top (e.g. date +
   *  municipality filters), an optional card title, and a collapse affordance to
   *  reclaim map space. */
  header?: ReactNode;
  title?: string;
  collapsible?: boolean;
  className?: string;
};

/** Small rotated-diamond swatch mirroring the map's event markers. Decorative —
 *  the adjacent text label is the accessible name. */
function DiamondSample({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 rotate-45 rounded-[1px] border border-white/70"
      style={{ background: color }}
    />
  );
}

/**
 * A small SVG sample of a track's line style (color + solid/dashed) used in the
 * legend. Decorative — the adjacent text label is the accessible name.
 */
function LineSample({ type }: { type: PatrolType }) {
  const style = PATROL_TRACK_STYLES[type];
  return (
    <svg
      width={28}
      height={8}
      viewBox="0 0 28 8"
      aria-hidden="true"
      className="shrink-0"
    >
      <line
        x1={1}
        y1={4}
        x2={27}
        y2={4}
        stroke={style.color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={
          style.dashArray ? style.dashArray.map((n) => n * 3).join(" ") : undefined
        }
      />
    </svg>
  );
}

/**
 * Live Map legend + show/hide toggles for the all-active-tracks overlay.
 * Accessibility: every row pairs a colored line sample with a TEXT label (never
 * color-only); each toggle is keyboard-operable (Radix Switch) and its hit area
 * is padded to a >=44px touch target.
 */
export function TrackLegend({
  showTracks,
  onShowTracksChange,
  visibility,
  onTypeVisibilityChange,
  eventLayers,
  onEventLayerChange,
  eventTypesByCategory,
  disabledTypeIds,
  onTypeToggle,
  typeCounts,
  disabledTypeValues,
  onTypeValueToggle,
  typeValueCounts,
  displayMode,
  onDisplayModeChange,
  showTrackHeatmap,
  onShowTrackHeatmapChange,
  showBoundaries,
  onShowBoundariesChange,
  showSkylight,
  onShowSkylightChange,
  showThumbnails,
  onShowThumbnailsChange,
  orientation = "vertical",
  header,
  title,
  collapsible = false,
  className,
}: TrackLegendProps) {
  if (orientation === "horizontal") {
    return (
      <section
        aria-label="Patrol track legend and filters"
        className={cn(
          "flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border bg-card px-3 py-1.5 text-sm",
          className,
        )}
      >
        <div className="flex min-h-9 items-center gap-2">
          <Label htmlFor="track-show-all" className="cursor-pointer font-medium">
            Patrol tracks
          </Label>
          <Switch
            id="track-show-all"
            checked={showTracks}
            onCheckedChange={onShowTracksChange}
            aria-label="Show all patrol tracks"
          />
        </div>

        <div className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

        {PATROL_TRACK_TYPES.map((type) => {
          const style = PATROL_TRACK_STYLES[type];
          const inputId = `track-type-${type}`;
          return (
            <div key={type} className="flex min-h-9 items-center gap-2">
              <Label
                htmlFor={inputId}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5",
                  !showTracks && "opacity-50",
                )}
              >
                <LineSample type={type} />
                <span>{style.label}</span>
              </Label>
              <Switch
                id={inputId}
                checked={visibility[type]}
                disabled={!showTracks}
                onCheckedChange={(next) => { onTypeVisibilityChange(type, next); }}
                aria-label={`Show ${style.label.toLowerCase()} tracks`}
              />
            </div>
          );
        })}

        {/* Patrol-track display mode — lines vs heatmap (Interactive Report
            Map). Relocated into the patrol-tracks group. */}
        {showTrackHeatmap !== undefined && onShowTrackHeatmapChange !== undefined && (
          <div className="flex min-h-9 items-center gap-2">
            <Label
              htmlFor="track-display-mode"
              className="cursor-pointer font-medium"
            >
              Tracks as heatmap
            </Label>
            <Switch
              id="track-display-mode"
              checked={showTrackHeatmap}
              onCheckedChange={onShowTrackHeatmapChange}
              aria-label="Show patrol tracks as a density heatmap (cyan = seaborne, orange = foot)"
            />
          </div>
        )}

        {/* Event-marker layers — operator-triggered, default OFF (2026-06-27).
            The events-heatmap toggle lives inside this group (relocated
            2026-07-04) so it reads as "heatmap for event types". */}
        {eventLayers !== undefined && onEventLayerChange !== undefined && (
          <>
            <div
              className="hidden h-5 w-px bg-border sm:block"
              aria-hidden="true"
            />
            {EVENT_LAYER_LEGEND.map(({ key, label, color }) => {
              const inputId = `event-layer-${key}`;
              return (
                <div key={key} className="flex min-h-9 items-center gap-2">
                  <Label
                    htmlFor={inputId}
                    className="flex cursor-pointer items-center gap-1.5"
                  >
                    <DiamondSample color={color} />
                    <span>{label}</span>
                  </Label>
                  <Switch
                    id={inputId}
                    checked={eventLayers[key]}
                    onCheckedChange={(next) => { onEventLayerChange(key, next); }}
                    aria-label={`Show ${label.toLowerCase()} events on the map`}
                  />
                </div>
              );
            })}
            {displayMode !== undefined && onDisplayModeChange !== undefined && (
              <div className="flex min-h-9 items-center gap-2">
                <Label
                  htmlFor="event-display-mode"
                  className="cursor-pointer font-medium"
                >
                  Show events as heatmap
                </Label>
                <Switch
                  id="event-display-mode"
                  checked={displayMode === "heatmap"}
                  onCheckedChange={(next) => {
                    onDisplayModeChange(next ? "heatmap" : "dots");
                  }}
                  aria-label="Show events as a density heatmap instead of individual markers"
                />
              </div>
            )}
          </>
        )}

        {/* Official coverage boundaries (municipality land/water + MPA outlines). */}
        {showBoundaries !== undefined &&
          onShowBoundariesChange !== undefined && (
            <>
              <div
                className="hidden h-5 w-px bg-border sm:block"
                aria-hidden="true"
              />
              <div className="flex min-h-9 items-center gap-2">
                <Label
                  htmlFor="show-boundaries"
                  className="cursor-pointer font-medium"
                >
                  Boundaries
                </Label>
                <Switch
                  id="show-boundaries"
                  checked={showBoundaries}
                  onCheckedChange={onShowBoundariesChange}
                  aria-label="Show official coverage boundaries on the map"
                />
              </div>
            </>
          )}

        {/* Skylight automated vessel-detection events (SKY-1). Default OFF —
            excluded from the map's events unless the operator opts in. */}
        {showSkylight !== undefined && onShowSkylightChange !== undefined && (
          <>
            <div
              className="hidden h-5 w-px bg-border sm:block"
              aria-hidden="true"
            />
            <div className="flex min-h-9 items-center gap-2">
              <Label
                htmlFor="show-skylight"
                className="cursor-pointer font-medium"
              >
                Skylight events
              </Label>
              <Switch
                id="show-skylight"
                checked={showSkylight}
                onCheckedChange={onShowSkylightChange}
                aria-label="Show Skylight events on the map"
              />
            </div>
          </>
        )}

        {/* Event photo-preview thumbnails (image markers, zoomed-in). Default
            ON — off collapses every event to its plain icon-chip marker. */}
        {showThumbnails !== undefined && onShowThumbnailsChange !== undefined && (
          <>
            <div
              className="hidden h-5 w-px bg-border sm:block"
              aria-hidden="true"
            />
            <div className="flex min-h-9 items-center gap-2">
              <Label
                htmlFor="show-thumbnails"
                className="cursor-pointer font-medium"
              >
                Photo thumbnails
              </Label>
              <Switch
                id="show-thumbnails"
                checked={showThumbnails}
                onCheckedChange={onShowThumbnailsChange}
                aria-label="Show event photo thumbnails on the map"
              />
            </div>
          </>
        )}
      </section>
    );
  }

  return <VerticalTrackLegend
    showTracks={showTracks}
    onShowTracksChange={onShowTracksChange}
    visibility={visibility}
    onTypeVisibilityChange={onTypeVisibilityChange}
    eventLayers={eventLayers}
    onEventLayerChange={onEventLayerChange}
    eventTypesByCategory={eventTypesByCategory}
    disabledTypeIds={disabledTypeIds}
    onTypeToggle={onTypeToggle}
    typeCounts={typeCounts}
    disabledTypeValues={disabledTypeValues}
    onTypeValueToggle={onTypeValueToggle}
    typeValueCounts={typeValueCounts}
    displayMode={displayMode}
    onDisplayModeChange={onDisplayModeChange}
    showTrackHeatmap={showTrackHeatmap}
    onShowTrackHeatmapChange={onShowTrackHeatmapChange}
    showBoundaries={showBoundaries}
    onShowBoundariesChange={onShowBoundariesChange}
    showSkylight={showSkylight}
    onShowSkylightChange={onShowSkylightChange}
    showThumbnails={showThumbnails}
    onShowThumbnailsChange={onShowThumbnailsChange}
    header={header}
    title={title}
    collapsible={collapsible}
    className={className}
  />;
}

/**
 * Vertical floating-card variant (Interactive Report Map). Holds the full
 * control set — an optional header slot (date + municipality filters), the
 * master + per-type patrol-track toggles, and (when provided) the event-layer
 * and heatmap toggles — in one compact, collapsible card overlaid on the map's
 * upper-left so the map itself gets the full panel height.
 */
function VerticalTrackLegend({
  showTracks,
  onShowTracksChange,
  visibility,
  onTypeVisibilityChange,
  eventLayers,
  onEventLayerChange,
  eventTypesByCategory,
  disabledTypeIds,
  onTypeToggle,
  typeCounts,
  disabledTypeValues,
  onTypeValueToggle,
  typeValueCounts,
  displayMode,
  onDisplayModeChange,
  showTrackHeatmap,
  onShowTrackHeatmapChange,
  showBoundaries,
  onShowBoundariesChange,
  showSkylight,
  onShowSkylightChange,
  showThumbnails,
  onShowThumbnailsChange,
  header,
  title,
  collapsible,
  className,
}: {
  showTracks: boolean;
  onShowTracksChange: (next: boolean) => void;
  visibility: PatrolTrackVisibility;
  onTypeVisibilityChange: (type: PatrolType, next: boolean) => void;
  eventLayers: Record<EventLayerKey, boolean> | undefined;
  onEventLayerChange: ((layer: EventLayerKey, next: boolean) => void) | undefined;
  eventTypesByCategory: MapEventTypesByCategory | undefined;
  disabledTypeIds: Set<string> | undefined;
  onTypeToggle: ((typeId: string, next: boolean) => void) | undefined;
  typeCounts: Record<string, number> | undefined;
  disabledTypeValues: Set<string> | undefined;
  onTypeValueToggle: ((key: string, next: boolean) => void) | undefined;
  typeValueCounts: Record<string, number> | undefined;
  displayMode: "dots" | "heatmap" | undefined;
  onDisplayModeChange: ((next: "dots" | "heatmap") => void) | undefined;
  showTrackHeatmap: boolean | undefined;
  onShowTrackHeatmapChange: ((next: boolean) => void) | undefined;
  showBoundaries: boolean | undefined;
  onShowBoundariesChange: ((next: boolean) => void) | undefined;
  showSkylight: boolean | undefined;
  onShowSkylightChange: ((next: boolean) => void) | undefined;
  showThumbnails: boolean | undefined;
  onShowThumbnailsChange: ((next: boolean) => void) | undefined;
  header: ReactNode;
  title: string | undefined;
  collapsible: boolean | undefined;
  className: string | undefined;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Which category sublists are expanded to reveal their per-type toggles.
  // Default collapsed so the floating card stays compact; the operator expands a
  // category to filter its specific types (revealed on click — owner spec).
  const [expandedCategories, setExpandedCategories] = useState<Set<EventLayerKey>>(
    () => new Set<EventLayerKey>(),
  );
  const toggleCategoryExpanded = (key: EventLayerKey) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  // Which L2 type rows are expanded to reveal their L3 "Type" sub-toggles. Keyed
  // by event-type id. Default collapsed so the card stays compact; the operator
  // expands a type to filter its specific sub-values (revealed on click).
  const [expandedTypeIds, setExpandedTypeIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const toggleTypeExpanded = (id: string) => {
    setExpandedTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const hasHeaderRow = title !== undefined || collapsible === true;
  // Per-type toggle tree is available only when the map supplied the taxonomy
  // and a toggle handler (floating Report Map controls).
  const hasTypeTree =
    eventTypesByCategory !== undefined && onTypeToggle !== undefined;
  // The L3 sub-value tree is available only when the map also supplied a value
  // toggle handler.
  const hasValueTree = onTypeValueToggle !== undefined;

  return (
    <section
      aria-label="Map controls"
      className={cn(
        "flex flex-col overflow-hidden rounded-md border bg-background/95 text-sm shadow-md backdrop-blur",
        className,
      )}
    >
      {hasHeaderRow && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 py-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {title ?? "Map controls"}
          </span>
          {collapsible === true && (
            <button
              type="button"
              onClick={() => { setCollapsed((c) => !c); }}
              className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand map controls" : "Collapse map controls"}
            >
              {collapsed ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronUp className="size-4" />
              )}
            </button>
          )}
        </div>
      )}

      {!collapsed && (
        <div
          className={cn(
            "min-h-0 flex-1 space-y-0 overflow-y-auto px-2.5 pb-2",
            hasHeaderRow ? "" : "pt-3",
          )}
        >
          {header !== undefined && (
            <div className="border-b pb-1.5">{header}</div>
          )}

          {/* Master patrol-tracks toggle */}
          <div className="flex min-h-7 items-center justify-between gap-2 pt-0.5">
            <Label htmlFor="track-show-all" className="cursor-pointer font-medium">
              Patrol tracks
            </Label>
            <Switch
              id="track-show-all"
              checked={showTracks}
              onCheckedChange={onShowTracksChange}
              aria-label="Show all patrol tracks"
            />
          </div>

          <div className="border-t pt-0.5">
            {PATROL_TRACK_TYPES.map((type) => {
              const style = PATROL_TRACK_STYLES[type];
              const inputId = `track-type-${type}`;
              return (
                <div
                  key={type}
                  className="flex min-h-7 items-center justify-between gap-2"
                >
                  <Label
                    htmlFor={inputId}
                    className={cn(
                      "flex cursor-pointer items-center gap-2",
                      !showTracks && "opacity-50",
                    )}
                  >
                    <LineSample type={type} />
                    <span>{style.label}</span>
                  </Label>
                  <Switch
                    id={inputId}
                    checked={visibility[type]}
                    disabled={!showTracks}
                    onCheckedChange={(next) => { onTypeVisibilityChange(type, next); }}
                    aria-label={`Show ${style.label.toLowerCase()} tracks`}
                  />
                </div>
              );
            })}

            {/* Patrol-track display mode — lines vs a density heatmap of the
                currently-visible tracks, color-distinguished by patrol type
                (seaborne = cyan, foot = orange). Interactive Report Map only. */}
            {showTrackHeatmap !== undefined &&
              onShowTrackHeatmapChange !== undefined && (
                <>
                  <div className="mt-0.5 flex min-h-7 items-center justify-between gap-2 border-t pt-0.5">
                    <Label
                      htmlFor="track-display-mode"
                      className="cursor-pointer text-[12px] font-medium"
                    >
                      Show tracks as heatmap
                    </Label>
                    <Switch
                      id="track-display-mode"
                      checked={showTrackHeatmap}
                      onCheckedChange={onShowTrackHeatmapChange}
                      aria-label="Show patrol tracks as a density heatmap (cyan = seaborne, orange = foot)"
                    />
                  </div>
                  {showTrackHeatmap && (
                    <p className="px-0.5 pb-0.5 text-[10px] text-muted-foreground">
                      Cyan = seaborne · Orange = foot
                    </p>
                  )}
                </>
              )}
          </div>

          {/* Official coverage boundaries (municipality land/water + MPA). */}
          {showBoundaries !== undefined &&
            onShowBoundariesChange !== undefined && (
              <div className="border-t pt-0.5">
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <Label
                    htmlFor="show-boundaries"
                    className="cursor-pointer font-medium"
                  >
                    Boundaries
                  </Label>
                  <Switch
                    id="show-boundaries"
                    checked={showBoundaries}
                    onCheckedChange={onShowBoundariesChange}
                    aria-label="Show official coverage boundaries on the map"
                  />
                </div>
              </div>
            )}

          {/* Skylight automated vessel-detection events (SKY-1). Default OFF —
              excluded from the map's events unless the operator opts in. */}
          {showSkylight !== undefined && onShowSkylightChange !== undefined && (
            <div className="border-t pt-0.5">
              <div className="flex min-h-7 items-center justify-between gap-2">
                <Label
                  htmlFor="show-skylight"
                  className="cursor-pointer font-medium"
                >
                  Skylight events
                </Label>
                <Switch
                  id="show-skylight"
                  checked={showSkylight}
                  onCheckedChange={onShowSkylightChange}
                  aria-label="Show Skylight events on the map"
                />
              </div>
            </div>
          )}

          {/* Event photo-preview thumbnails (image markers, zoomed-in).
              Default ON — off collapses every event to its plain icon-chip
              marker. */}
          {showThumbnails !== undefined && onShowThumbnailsChange !== undefined && (
            <div className="border-t pt-0.5">
              <div className="flex min-h-7 items-center justify-between gap-2">
                <Label
                  htmlFor="show-thumbnails"
                  className="cursor-pointer font-medium"
                >
                  Photo thumbnails
                </Label>
                <Switch
                  id="show-thumbnails"
                  checked={showThumbnails}
                  onCheckedChange={onShowThumbnailsChange}
                  aria-label="Show event photo thumbnails on the map"
                />
              </div>
            </div>
          )}

          {/* Event-marker layers — a category master toggle, each with a
              collapsible sublist of its specific event types (the per-type
              toggles, revealed on click). A type is shown unless its switch is
              off; the count badge is its in-range marker count. */}
          {eventLayers !== undefined && onEventLayerChange !== undefined && (
            <div className="border-t pt-0.5">
              {EVENT_LAYER_LEGEND.map(({ key, label, color, category }) => {
                const inputId = `event-layer-${key}`;
                const types =
                  eventTypesByCategory !== undefined
                    ? eventTypesByCategory[key]
                    : [];
                const expandable = hasTypeTree && types.length > 0;
                const expanded = expandedCategories.has(key);
                const masterOn = eventLayers[key];
                return (
                  <div key={key}>
                    <div className="flex min-h-7 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        {expandable ? (
                          <button
                            type="button"
                            onClick={() => { toggleCategoryExpanded(key); }}
                            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? `Hide ${label.toLowerCase()} types`
                                : `Show ${label.toLowerCase()} types`
                            }
                          >
                            {expanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </button>
                        ) : (
                          <span
                            className="inline-block w-[1.125rem]"
                            aria-hidden="true"
                          />
                        )}
                        <Label
                          htmlFor={inputId}
                          className="flex min-w-0 cursor-pointer items-center gap-2"
                        >
                          <DiamondSample color={color} />
                          <span className="truncate">{label}</span>
                        </Label>
                      </div>
                      <Switch
                        id={inputId}
                        checked={masterOn}
                        onCheckedChange={(next) => { onEventLayerChange(key, next); }}
                        aria-label={`Show ${label.toLowerCase()} events on the map`}
                      />
                    </div>

                    {expandable && expanded && (
                      <div className="mb-1 ml-5 border-l pl-1.5">
                        {types.map((t) => {
                          const Icon = eventTypeIcon(t.display, category);
                          const typeOn =
                            disabledTypeIds === undefined ||
                            !disabledTypeIds.has(t.id);
                          const count = typeCounts?.[t.id] ?? 0;
                          const typeInputId = `event-type-${t.id}`;
                          // L3 sub-values for this type (the ER "Type" dropdown).
                          const l3 = t.types ?? [];
                          const l2Expandable = hasValueTree && l3.length > 0;
                          const l2Expanded = expandedTypeIds.has(t.id);
                          return (
                            <div key={t.id}>
                              <div
                                className={cn(
                                  "flex min-h-6 items-center justify-between gap-1.5",
                                  !masterOn && "opacity-50",
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-0.5">
                                  {l2Expandable ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        toggleTypeExpanded(t.id);
                                      }}
                                      className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                      aria-expanded={l2Expanded}
                                      aria-label={
                                        l2Expanded
                                          ? `Hide ${t.display} sub-types`
                                          : `Show ${t.display} sub-types`
                                      }
                                    >
                                      {l2Expanded ? (
                                        <ChevronDown className="size-3" />
                                      ) : (
                                        <ChevronRight className="size-3" />
                                      )}
                                    </button>
                                  ) : (
                                    <span
                                      className="inline-block w-[1rem]"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <Label
                                    htmlFor={typeInputId}
                                    className="flex min-w-0 cursor-pointer items-center gap-1.5 text-[12px]"
                                  >
                                    <Icon
                                      className="size-3 shrink-0"
                                      style={{ color }}
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">{t.display}</span>
                                    <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                                      {count}
                                    </span>
                                  </Label>
                                </div>
                                <Switch
                                  id={typeInputId}
                                  checked={typeOn}
                                  disabled={!masterOn}
                                  onCheckedChange={(next) => {
                                    onTypeToggle(t.id, next);
                                  }}
                                  aria-label={`Show ${t.display} events on the map`}
                                />
                              </div>

                              {/* L3 "Type" sub-toggles — very small, indented,
                                  muted; one per distinct "Type" value (incl. an
                                  "(Unspecified)" bucket so no markers vanish). */}
                              {l2Expandable && l2Expanded && (
                                <div className="mb-0.5 ml-4 border-l pl-1.5">
                                  {l3.map((tv) => {
                                    const valueKey = `${t.id}::${tv.value}`;
                                    const valueOn =
                                      disabledTypeValues === undefined ||
                                      !disabledTypeValues.has(valueKey);
                                    // In-range count ONLY (owner 2026-07-12):
                                    // the badge must reflect what's plotted on
                                    // the map for the active date/area filters,
                                    // matching the L2 parent badge. A sub-value
                                    // with no in-range markers shows 0 (it stays
                                    // listed so it can still be toggled) — we no
                                    // longer fall back to tv.count, the all-time
                                    // dataset total, which mixed scopes and made
                                    // the child counts (all-time) disagree with
                                    // the parent (in-range).
                                    const valueCount =
                                      typeValueCounts?.[valueKey] ?? 0;
                                    const valueInputId = `event-type-value-${valueKey}`;
                                    return (
                                      <div
                                        key={tv.value}
                                        className={cn(
                                          "flex min-h-5 items-center justify-between gap-1",
                                          (!masterOn || !typeOn) && "opacity-50",
                                        )}
                                      >
                                        <Label
                                          htmlFor={valueInputId}
                                          className="flex min-w-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground"
                                        >
                                          <span className="truncate">
                                            {tv.value}
                                          </span>
                                          <span className="shrink-0 tabular-nums text-[9px]">
                                            {valueCount}
                                          </span>
                                        </Label>
                                        <Switch
                                          id={valueInputId}
                                          checked={valueOn}
                                          disabled={!masterOn || !typeOn}
                                          className="scale-90"
                                          onCheckedChange={(next) => {
                                            onTypeValueToggle(valueKey, next);
                                          }}
                                          aria-label={`Show ${t.display} — ${tv.value} events on the map`}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Events heatmap toggle — relocated inside the events group
                  (2026-07-04) so it reads as "heatmap for event types" rather
                  than a separate, unrelated block below. */}
              {displayMode !== undefined && onDisplayModeChange !== undefined && (
                <div className="mt-0.5 flex min-h-7 items-center justify-between gap-2 border-t pt-0.5">
                  <Label
                    htmlFor="event-display-mode"
                    className="cursor-pointer text-[12px] font-medium"
                  >
                    Show events as heatmap
                  </Label>
                  <Switch
                    id="event-display-mode"
                    checked={displayMode === "heatmap"}
                    onCheckedChange={(next) => {
                      onDisplayModeChange(next ? "heatmap" : "dots");
                    }}
                    aria-label="Show events as a density heatmap instead of individual markers"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
