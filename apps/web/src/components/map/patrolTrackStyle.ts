// Patrol-track styling by patrol type for the Live Map all-active-tracks
// overlay (Phase 7). Owner-approved (2026-06-21): differentiate patrol types by
// BOTH an accent color AND a line pattern so the distinction survives
// colorblindness (the solid/dashed pattern is a non-color cue).
//
// Colors are pulled from the existing MG design tokens (docs/tokens.json) so
// they fit the dark theme:
//   - seaborne -> `info`    #00C9DB (cyan)   — already the "patrol tracks" token
//   - foot     -> `warning` #E8912D (orange) — distinct hue (~25° vs ~183°)
// Both sit at high contrast against the #0A0A0A map base.

export type PatrolType = "foot" | "seaborne";

export type PatrolTrackTypeStyle = {
  /** Display label for the legend (text, never color-only). */
  label: string;
  /** CSS hex color applied to the MapLibre line layer. */
  color: string;
  /** Line width in px. */
  width: number;
  /** Line opacity 0..1. */
  opacity: number;
  /**
   * MapRoute dashArray ([dash, gap]) or null for a solid line. Seaborne is
   * solid; foot is dashed — the non-color cue.
   */
  dashArray: [number, number] | null;
};

export const PATROL_TRACK_STYLES: Record<PatrolType, PatrolTrackTypeStyle> = {
  seaborne: {
    label: "Seaborne patrol",
    color: "#00C9DB", // info token
    width: 3,
    opacity: 0.9,
    dashArray: null, // solid
  },
  foot: {
    label: "Foot patrol",
    color: "#E8912D", // warning token
    width: 3,
    opacity: 0.9,
    dashArray: [2, 2], // dashed
  },
};

/** All patrol types in stable legend/toggle order. */
export const PATROL_TRACK_TYPES: PatrolType[] = ["seaborne", "foot"];

/** Resolve the style for a patrol type. */
export function patrolTrackStyle(type: PatrolType): PatrolTrackTypeStyle {
  return PATROL_TRACK_STYLES[type];
}

/**
 * Concrete HSL triple for a patrol type's heatmap ramp (Interactive Report
 * Map track-heatmap toggle). MapLibre paint cannot read CSS custom properties
 * at runtime, so this converts the same PATROL_TRACK_STYLES hex swatches used
 * by the line overlay to literal HSL — seaborne (#00C9DB -> {h:185,s:100,l:43})
 * and foot (#E8912D -> {h:32,s:80,l:54}) stay color-distinct in heat form,
 * matching the track lines + legend swatches exactly.
 */
export function patrolTrackHeatHsl(
  type: PatrolType,
): { h: number; s: number; l: number } {
  if (type === "seaborne") return { h: 185, s: 100, l: 43 };
  return { h: 32, s: 80, l: 54 };
}

export type PatrolTrackVisibility = Record<PatrolType, boolean>;

export const DEFAULT_TRACK_VISIBILITY: PatrolTrackVisibility = {
  seaborne: true,
  foot: true,
};

type TrackLike = { patrolType: PatrolType };

/**
 * Filter a list of tracks by the master show/hide flag and per-type
 * visibility. Pure — unit-tested independently of React.
 */
export function filterVisibleTracks<T extends TrackLike>(
  tracks: T[],
  showTracks: boolean,
  visibility: PatrolTrackVisibility,
): T[] {
  if (!showTracks) return [];
  return tracks.filter((t) => visibility[t.patrolType]);
}
