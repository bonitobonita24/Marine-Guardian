"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PATROL_TRACK_STYLES,
  PATROL_TRACK_TYPES,
  type PatrolTrackVisibility,
  type PatrolType,
} from "./patrolTrackStyle";

type TrackLegendProps = {
  /** Master show/hide for all active patrol tracks. */
  showTracks: boolean;
  onShowTracksChange: (next: boolean) => void;
  /** Per-type visibility map. */
  visibility: PatrolTrackVisibility;
  onTypeVisibilityChange: (type: PatrolType, next: boolean) => void;
  /** "vertical" stacked card (overlay) or "horizontal" toolbar row (above map). */
  orientation?: "vertical" | "horizontal";
  className?: string;
};

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
  orientation = "vertical",
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
      </section>
    );
  }

  return (
    <section
      aria-label="Patrol track legend and filters"
      className={cn(
        "rounded-md border bg-background/95 p-3 text-sm shadow-md backdrop-blur",
        className,
      )}
    >
      {/* Master toggle */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Label
          htmlFor="track-show-all"
          className="cursor-pointer font-medium"
        >
          Active patrol tracks
        </Label>
        <Switch
          id="track-show-all"
          checked={showTracks}
          onCheckedChange={onShowTracksChange}
          aria-label="Show all active patrol tracks"
        />
      </div>

      <div className="mt-1 border-t pt-1">
        {PATROL_TRACK_TYPES.map((type) => {
          const style = PATROL_TRACK_STYLES[type];
          const inputId = `track-type-${type}`;
          return (
            <div
              key={type}
              className="flex min-h-11 items-center justify-between gap-3"
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
    </section>
  );
}
