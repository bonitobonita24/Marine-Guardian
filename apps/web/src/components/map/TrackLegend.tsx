"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PATROL_TRACK_STYLES,
  PATROL_TRACK_TYPES,
  type PatrolTrackVisibility,
  type PatrolType,
} from "./patrolTrackStyle";

/** Event-marker layer toggles shown after the patrol-track toggles (horizontal
 *  toolbar only). Both default OFF — events are operator-triggered. Colors match
 *  the dashboard breakdown cards (law enforcement = chart-1, monitoring = chart-2)
 *  and the swatch is a rotated diamond mirroring the map's event markers. */
type EventLayerKey = "lawEnforcement" | "monitoring";
const EVENT_LAYER_LEGEND: {
  key: EventLayerKey;
  label: string;
  color: string;
}[] = [
  { key: "lawEnforcement", label: "Law enforcement", color: "hsl(var(--chart-1))" },
  { key: "monitoring", label: "Monitoring", color: "hsl(var(--chart-2))" },
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
  /** Event display mode (Interactive Report Map): individual dots vs density
   *  heatmap. When provided (horizontal toolbar only), a Dots⇄Heatmap toggle is
   *  shown. Off = "dots" (default), on = "heatmap". */
  displayMode?: "dots" | "heatmap";
  onDisplayModeChange?: (next: "dots" | "heatmap") => void;
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
  displayMode,
  onDisplayModeChange,
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

        {/* Event-marker layers — operator-triggered, default OFF (2026-06-27). */}
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
          </>
        )}

        {/* Event display mode — Dots vs Heatmap (Interactive Report Map). */}
        {displayMode !== undefined && onDisplayModeChange !== undefined && (
          <>
            <div
              className="hidden h-5 w-px bg-border sm:block"
              aria-hidden="true"
            />
            <div className="flex min-h-9 items-center gap-2">
              <Label
                htmlFor="event-display-mode"
                className="cursor-pointer font-medium"
              >
                Heatmap
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
    displayMode={displayMode}
    onDisplayModeChange={onDisplayModeChange}
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
  displayMode,
  onDisplayModeChange,
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
  displayMode: "dots" | "heatmap" | undefined;
  onDisplayModeChange: ((next: "dots" | "heatmap") => void) | undefined;
  header: ReactNode;
  title: string | undefined;
  collapsible: boolean | undefined;
  className: string | undefined;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasHeaderRow = title !== undefined || collapsible === true;

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
          </div>

          {/* Event-marker layers — operator-triggered, default OFF. */}
          {eventLayers !== undefined && onEventLayerChange !== undefined && (
            <div className="border-t pt-0.5">
              {EVENT_LAYER_LEGEND.map(({ key, label, color }) => {
                const inputId = `event-layer-${key}`;
                return (
                  <div
                    key={key}
                    className="flex min-h-7 items-center justify-between gap-2"
                  >
                    <Label
                      htmlFor={inputId}
                      className="flex cursor-pointer items-center gap-2"
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
            </div>
          )}

          {/* Event display mode — Dots vs Heatmap. */}
          {displayMode !== undefined && onDisplayModeChange !== undefined && (
            <div className="border-t pt-0.5">
              <div className="flex min-h-7 items-center justify-between gap-2">
                <Label
                  htmlFor="event-display-mode"
                  className="cursor-pointer font-medium"
                >
                  Heatmap
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}
