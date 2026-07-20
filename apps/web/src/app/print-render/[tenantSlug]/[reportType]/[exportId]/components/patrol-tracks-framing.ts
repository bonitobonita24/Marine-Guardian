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
 * FIX (part 1): when a scope is present, frame the UNION of the scope bounds
 * and the rendered track extent — the scope polygon stays visible for context
 * while the tracks are fully contained.
 *
 * WHY THAT FIX DID NOT TAKE (part 2, 2026-07-20): the union WAS being
 * computed and the camera WAS being set from it — but the zoom that union was
 * turned into was too high by ~2 levels, so the correctly-computed union
 * simply did not fit in the box. Two compounding causes:
 *
 *   1. WRONG ASSUMED BOX HEIGHT. The camera zoom is computed from an assumed
 *      rendered pixel size (live `map.getSize()` is unreliable in this
 *      multi-page Puppeteer print document — see bounds-view.ts's header).
 *      patrol-tracks-map.tsx assumed 560×360, but report-map-report.tsx's
 *      `.patrol-tracks-block` CSS pins the map box to `height: 235px`. Fitting
 *      to a 360px-tall box and rendering into a 235px-tall one over-zooms
 *      vertically by log2(328/203) ≈ 0.7 levels. Horizontal fit was fine
 *      (the box is ~655px wide), which is exactly why the overflow was
 *      vertical-only: the browser repro found 176 track pixels on the BOTTOM
 *      edge and 0 on left/right.
 *   2. `boundsToView` ROUNDS the zoom (`Math.round`, deliberately — it is an
 *      aesthetic initial frame for other islands, explicitly "not a hard must
 *      never clip guarantee"). Rounding up adds a further ≤0.5 levels.
 *
 *      Worked example on the reported repro (Sablayan + children +
 *      traversing, union incl. Apo Reef ≈ lat 12.50–13.10, lon 120.40–121.40):
 *      the old path computed min(zoomLon 9.53, zoomLat@360px 9.55) = 9.53 and
 *      ROUNDED UP to zoom 10, while the tallest zoom that actually fits the
 *      real 235px box is 8.86 → 8. Two whole zoom levels = the latitude span
 *      drawn ~4× taller than the box. Hence "the fan-out is drawn but the
 *      frame does not contain it".
 *
 * FIX (part 2): this module no longer delegates to `boundsToView`. It owns a
 * CONTAINMENT-GUARANTEEING view computation (`computeContainedView`) that
 *   - FLOORS the zoom instead of rounding it, so the fitted viewport is never
 *     smaller than the bounds, and
 *   - centres in WEB-MERCATOR Y space rather than on the arithmetic mean of
 *     the latitudes (the two differ by tens of pixels at report zooms, which
 *     biases the frame vertically — the same axis that was overflowing),
 * and callers pass the map box's REAL dimensions. `viewportBoundsForView`
 * exposes the inverse projection so tests can assert directly that every
 * rendered track vertex lands strictly inside the fitted viewport.
 *
 * `boundsToView` is deliberately left untouched: it is shared with the event /
 * heatmap islands, whose framing is browser-confirmed good, and its rounding
 * behaviour is intentional there.
 *
 * WHY IT LIVES IN ITS OWN MODULE: patrol-tracks-map.tsx imports leaflet /
 * react-leaflet, which touch `window` at import time and cannot be loaded in
 * the node-environment vitest suite. Keeping the computation leaflet-free
 * makes it directly unit-testable.
 */

import type { ReportMapBounds } from "@/server/report-map-report/get-report-map-report-data";
import { filterValidLatLonPairs } from "@/lib/map-coordinates";

/** Padding used when the frame is the plain scope box (no track extension). */
export const SCOPE_ONLY_PADDING_PX = 8;
/** Padding used when the frame had to grow to swallow track geometry running
 *  outside the scope polygon, and for the no-scope path — extra breathing
 *  room so the outermost vertex never sits flush against the edge. */
export const DATA_UNION_PADDING_PX = 16;

/** Zoom clamp, matching the values every island's fitBounds call used. */
const MIN_ZOOM = 3;
const MAX_ZOOM = 15;

/** What the camera should do once the map is mounted and sized. */
export type TracksFramingPlan =
  | { kind: "setView"; center: [number, number]; zoom: number }
  | { kind: "none" };

/** Web-Mercator Y of a latitude (degrees), as a signed fraction of the world
 *  square (−0.5 at the south edge … +0.5 at the north edge). */
function mercatorY(latDeg: number): number {
  return (
    Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360)) / (2 * Math.PI)
  );
}

/** Inverse of {@link mercatorY} — a world-square Y fraction back to degrees. */
function inverseMercatorY(y: number): number {
  return ((2 * Math.atan(Math.exp(2 * Math.PI * y)) - Math.PI / 2) * 180) / Math.PI;
}

/**
 * Compute a Leaflet center/zoom that is GUARANTEED to contain `bounds` inside
 * a `widthPx`×`heightPx` box with at least `paddingPx` of slack on every edge
 * — as long as the caller's box dimensions are not LARGER than the real
 * rendered ones.
 *
 * Differs from the shared `boundsToView` in exactly the two ways that let the
 * patrol-tracks frame clip (see this file's header):
 *   - FLOOR, not round: rounding up produces a zoom at which the bounds no
 *     longer fit. Flooring can only ever leave extra margin.
 *   - The centre latitude is the inverse projection of the mercator midpoint,
 *     not the arithmetic mean of the latitudes. Leaflet pans in projected
 *     space, so the arithmetic mean is off-centre vertically — the same axis
 *     that was overflowing.
 */
export function computeContainedView(
  bounds: { south: number; west: number; north: number; east: number },
  widthPx: number,
  heightPx: number,
  paddingPx: number,
): { center: [number, number]; zoom: number } {
  const { south, west, north, east } = bounds;

  const southY = mercatorY(south);
  const northY = mercatorY(north);
  const center: [number, number] = [
    inverseMercatorY((southY + northY) / 2),
    (west + east) / 2,
  ];

  const w = Math.max(1, widthPx - 2 * paddingPx);
  const h = Math.max(1, heightPx - 2 * paddingPx);

  // Degenerate (zero-span) bounds clamp to a tiny epsilon so log2 never sees
  // 0 or a negative input.
  const lonFraction = Math.max((east - west) / 360, 1e-9);
  const latFraction = Math.max(northY - southY, 1e-9);

  const zoomLon = Math.log2(w / (256 * lonFraction));
  const zoomLat = Math.log2(h / (256 * latFraction));

  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.floor(Math.min(zoomLon, zoomLat))),
  );
  return { center, zoom };
}

/**
 * The geographic bounds actually visible for a given center/zoom in a
 * `widthPx`×`heightPx` box — the inverse of {@link computeContainedView}.
 *
 * Exists so tests can assert containment against the SAME projection Leaflet
 * uses, instead of re-asserting the formula that produced the view.
 */
export function viewportBoundsForView(
  center: readonly [number, number],
  zoom: number,
  widthPx: number,
  heightPx: number,
): { south: number; west: number; north: number; east: number } {
  const worldPx = 256 * 2 ** zoom;
  const halfLon = (360 * (widthPx / worldPx)) / 2;
  const centerY = mercatorY(center[0]);
  const halfY = heightPx / worldPx / 2;
  return {
    south: inverseMercatorY(centerY - halfY),
    north: inverseMercatorY(centerY + halfY),
    west: center[1] - halfLon,
    east: center[1] + halfLon,
  };
}

/**
 * Compute the framing plan for the patrol-tracks map.
 *
 * Behaviour:
 *  - scope present → the UNION of the scope box and the usable track extent.
 *  - no scope → the usable track extent alone, and a no-op when fewer than 2
 *    usable vertices exist (leave the initial view alone rather than fitting a
 *    degenerate/empty box).
 *
 * BOTH paths now return a contained `setView` plan. The no-scope path used to
 * return a `fitBounds` plan, which delegated the zoom to Leaflet's live
 * `map.getSize()` — the very measurement this whole module exists to avoid
 * depending on in the print document (bounds-view.ts header). Every path now
 * goes through `computeContainedView`, so containment is uniform and testable.
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
    let s = Number.POSITIVE_INFINITY;
    let n = Number.NEGATIVE_INFINITY;
    let w = Number.POSITIVE_INFINITY;
    let e = Number.NEGATIVE_INFINITY;
    for (const [lat, lon] of usable) {
      if (lat < s) s = lat;
      if (lat > n) n = lat;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
    }
    const view = computeContainedView(
      { south: s, west: w, north: n, east: e },
      widthPx,
      heightPx,
      DATA_UNION_PADDING_PX,
    );
    return { kind: "setView", center: view.center, zoom: view.zoom };
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
  // default; a precomputed center/zoom has no size dependency (see
  // bounds-view.ts's file header).
  const { center, zoom } = computeContainedView(
    { south, west, north, east },
    widthPx,
    heightPx,
    extendedByData ? DATA_UNION_PADDING_PX : SCOPE_ONLY_PADDING_PX,
  );
  return { kind: "setView", center, zoom };
}
