/**
 * boundsToView — pure helper computing an initial Leaflet MapContainer
 * `center`/`zoom` pair from a municipality's water-area bounds, WITHOUT
 * depending on the live DOM container size at effect time.
 *
 * WHY THIS EXISTS (R12): the previous fix (R11, animate:false on the
 * post-mount `fitBounds` call in each island's `applyFraming`) did NOT
 * resolve the bug — confirmed by a real Puppeteer render still showing the
 * MapContainer default view (center=[13.0,121.0], zoom=9) for a
 * municipality-scoped report. `fitBounds` computes the target zoom from
 * `map.getSize()`, which is unreliable at effect time in this multi-page
 * Puppeteer print document (container may not have reached its final
 * laid-out size yet, even after `invalidateSize`). Rather than continuing
 * to chase container-size timing, this helper computes the framed view
 * PURELY from the bounds + an assumed/approximate rendered pixel size, so
 * the map can be framed correctly from the very FIRST paint via the
 * MapContainer's initial `center`/`zoom` props — no live measurement
 * needed. The existing `applyFraming` `fitBounds` call is kept as a
 * harmless refinement on top (see each island's `applyFraming`).
 *
 * ZOOM FORMULA (standard Web-Mercator "fit bounds in a box" math): at zoom
 * `z`, the world is `256 * 2^z` px wide. The bounds occupy a `lonFraction`
 * share of the full longitude range (360°) and a `latFraction` share of the
 * full Web-Mercator Y range (computed via the standard `mercatorY(lat) =
 * ln(tan(pi/4 + lat*pi/360)) / (2*pi)` projection, which is NOT linear in
 * latitude). The largest zoom at which the bounds still fit inside a
 * `widthPx`×`heightPx` box (minus padding) is:
 *
 *   zoomLon = log2( (widthPx  - 2*paddingPx) / (256 * lonFraction) )
 *   zoomLat = log2( (heightPx - 2*paddingPx) / (256 * latFraction) )
 *   zoom    = round( min(zoomLon, zoomLat) )
 *
 * `round` (not `floor`) is used deliberately: this is an aesthetic initial
 * framing for a print PDF, not a hard "must never clip" guarantee (the
 * `applyFraming` fitBounds refinement still runs after mount). `floor`
 * under-zooms visibly (e.g. the Abra de Ilog fixture below computes to
 * ~9.9, which `floor` would round down to 9 — indistinguishable from the
 * original bug's fallback zoom). `round` gives the visually tighter, more
 * useful frame while still being conservative enough not to clip the
 * bounds by more than half a zoom level.
 */

export interface BoundsViewBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface BoundsViewResult {
  center: [number, number];
  zoom: number;
}

export interface BoundsViewOptions {
  /** Pixel padding subtracted from each dimension before fitting. Default 8,
   *  matching the `padding: [8, 8]` used by every island's `applyFraming`
   *  fitBounds call. */
  paddingPx?: number;
  /** Minimum allowed zoom (clamp floor). Default 3. */
  minZoom?: number;
  /** Maximum allowed zoom (clamp ceiling). Default 15, matching the
   *  `maxZoom: 15` used by every island's `applyFraming` fitBounds call. */
  maxZoom?: number;
}

/** Web-Mercator Y projection of a latitude (in degrees), unnormalized —
 *  only the DIFFERENCE between two values is meaningful here. */
function mercatorY(latDeg: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360)) / (2 * Math.PI);
}

/**
 * Compute an initial Leaflet `center`/`zoom` pair that frames `bounds`
 * inside a `widthPx`×`heightPx` box, independent of any live DOM
 * measurement.
 */
export function boundsToView(
  bounds: BoundsViewBounds,
  widthPx: number,
  heightPx: number,
  opts: BoundsViewOptions = {},
): BoundsViewResult {
  const paddingPx = opts.paddingPx ?? 8;
  const minZoom = opts.minZoom ?? 3;
  const maxZoom = opts.maxZoom ?? 15;
  const { south, west, north, east } = bounds;

  const center: [number, number] = [(south + north) / 2, (west + east) / 2];

  const w = Math.max(1, widthPx - 2 * paddingPx);
  const h = Math.max(1, heightPx - 2 * paddingPx);

  // Guard against degenerate (zero-span) bounds — clamp to a tiny epsilon
  // so log2 never sees 0/negative input.
  const lonFraction = Math.max((east - west) / 360, 1e-9);
  const latFraction = Math.max(mercatorY(north) - mercatorY(south), 1e-9);

  const zoomLon = Math.log2(w / (256 * lonFraction));
  const zoomLat = Math.log2(h / (256 * latFraction));

  const rawZoom = Math.round(Math.min(zoomLon, zoomLat));
  const zoom = Math.min(maxZoom, Math.max(minZoom, rawZoom));

  return { center, zoom };
}
