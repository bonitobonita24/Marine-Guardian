/**
 * patrol-tracks-framing — pure camera-framing computation for
 * PatrolTracksMap. FRAME TO THE DATA, not just the scope polygon.
 *
 * WHY THIS EXISTS: the track clip was deliberately removed (owner decision —
 * whole patrol tracks are drawn, not just the portion inside the scope), so a
 * track routinely extends past the scope polygon. On a ZONE-scoped report the
 * two can be entirely DISJOINT — Apo Reef spans lon 120.396–120.562 while
 * Sablayan spans 120.622–121.399 — and the previous logic set the camera from
 * the scope polygon alone whenever scope bounds were present (the track-point
 * fitBounds branch was unreachable in that case). The frame stopped at the
 * zone edge while the tracks continued past it, running off all four edges of
 * the rendered map.
 *
 * FIX: when a scope is present, frame the UNION of the scope bounds and the
 * rendered track extent — the scope polygon stays visible for context while
 * the tracks are fully contained.
 *
 * WHY IT LIVES IN ITS OWN MODULE: patrol-tracks-map.tsx imports leaflet /
 * react-leaflet, which touch `window` at import time and cannot be loaded in
 * the node-environment vitest suite. Keeping the computation leaflet-free
 * makes it directly unit-testable.
 */

import type { ReportMapBounds } from "@/server/report-map-report/get-report-map-report-data";
import { filterValidLatLonPairs } from "@/lib/map-coordinates";
import { boundsToView } from "./bounds-view";

/** Padding used when the frame is the plain scope box (no track extension) —
 *  the historical value, kept identical so the browser-QA-confirmed
 *  municipality+children framing cannot shift across a rounding boundary. */
export const SCOPE_ONLY_PADDING_PX = 8;
/** Padding used when the frame had to grow to swallow track geometry running
 *  outside the scope polygon, and for the no-scope fitBounds path — extra
 *  breathing room so the outermost vertex never sits flush against the edge. */
export const DATA_UNION_PADDING_PX = 16;

/** What the camera should do once the map is mounted and sized. */
export type TracksFramingPlan =
  | { kind: "setView"; center: [number, number]; zoom: number }
  | { kind: "fitBounds"; bounds: Array<[number, number]>; paddingPx: number }
  | { kind: "none" };

/**
 * Compute the framing plan for the patrol-tracks map.
 *
 * Behaviour preserved from before the fix:
 *  - scope present, no usable track vertices → the plain scope box, with the
 *    same padding as before (so the same center/zoom to the bit).
 *  - no scope → the existing fitBounds-over-track-points path, and a no-op
 *    when fewer than 2 usable vertices exist (leave the initial view alone
 *    rather than fitting a degenerate/empty box).
 *
 * MAP GEOMETRY ONLY — (0,0)/non-finite/out-of-domain vertices are dropped
 * before fitting. A single Null-Island vertex on one track would otherwise
 * stretch the camera from West Africa to Mindoro. The polylines still draw
 * from the unfiltered tracks and every patrol total is untouched.
 */
export function computeTracksFraming(
  trackPoints: ReadonlyArray<[number, number]>,
  scopeBounds: ReportMapBounds | null | undefined,
  widthPx: number,
  heightPx: number,
): TracksFramingPlan {
  const usable = filterValidLatLonPairs(trackPoints);

  if (scopeBounds === null || scopeBounds === undefined) {
    if (usable.length < 2) return { kind: "none" };
    return {
      kind: "fitBounds",
      bounds: usable.map((p) => [p[0], p[1]] as [number, number]),
      paddingPx: DATA_UNION_PADDING_PX,
    };
  }

  let south = scopeBounds.south;
  let west = scopeBounds.west;
  let north = scopeBounds.north;
  let east = scopeBounds.east;
  for (const [lat, lon] of usable) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }

  const extendedByData =
    south !== scopeBounds.south ||
    west !== scopeBounds.west ||
    north !== scopeBounds.north ||
    east !== scopeBounds.east;

  // Re-assert a size-independent view via setView — NOT fitBounds. fitBounds
  // recomputes the zoom from the print container's unreliable measured size
  // and was resetting the correct initial zoom back to the whole-region
  // default; boundsToView + setView applies a precomputed center/zoom with no
  // size dependency (see bounds-view.ts's file header).
  const { center, zoom } = boundsToView(
    { south, west, north, east },
    widthPx,
    heightPx,
    {
      paddingPx: extendedByData ? DATA_UNION_PADDING_PX : SCOPE_ONLY_PADDING_PX,
    },
  );
  return { kind: "setView", center, zoom };
}
