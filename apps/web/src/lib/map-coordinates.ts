/**
 * map-coordinates — shared validity guard for coordinates that feed MAP
 * GEOMETRY (bounds/fit/zoom computations).
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Some EarthRanger-harvested events land in the database with
 * `location_lat = 0 AND location_lon = 0` — the classic "Null Island" sentinel
 * that a GPS/reporting client writes when it has no fix but still submits a
 * numeric coordinate pair. Four such rows exist in the dev DB (verified
 * 2026-07-20: cmqerkwjx0m19gm6div823ay7, cmqerko100lnxgm6d8kj4rv1z,
 * cmqeroc0g0pi5gm6dni8gede6, cmqerkwjt0m15gm6dlq5liq7a).
 *
 * (0,0) sits in the Gulf of Guinea, ~1,300 km off West Africa. Any bounds
 * computation that includes it stretches from there to the real Philippine
 * cluster near (13.6, 121.26) — roughly a third of the planet. The resulting
 * report map renders Africa and the Indian Ocean with the actual events
 * squeezed into an unreadable speck at the edge. Confirmed visually in a
 * generated PDF at the all-municipalities 2026-01-01..2026-07-20 scope.
 *
 * ─── SCOPE — GEOMETRY ONLY, NEVER DATA ───────────────────────────────────────
 * These helpers are for MAP GEOMETRY (fitBounds / boundsToView / LngLatBounds
 * inputs) and for deciding whether to draw a marker at a coordinate.
 *
 * They MUST NOT be used to filter a report's data. An event with a bad
 * coordinate is still a real event: it must keep counting in every total, KPI,
 * breakdown row, list and table exactly as it does today. We are excluding it
 * from the CAMERA, not from the REPORT. Every call site below is a
 * bounds/marker input, and each one is commented as such.
 *
 * ─── WHY THERE IS NO "IS IT IN THE PHILIPPINES?" CHECK ───────────────────────
 * A region bbox was considered and deliberately REJECTED. Marine-Guardian's
 * architecture is that it harvests raw data from ANY EarthRanger server — the
 * current deployment happens to point at mindoro.pamdas.org, but the app is
 * explicitly not Mindoro-specific, and boundaries are MG-side editable config
 * rather than baked-in geography. The only region-ish constants that exist in
 * the codebase are per-map `DEFAULT_CENTER` fallbacks (e.g. [13.0, 121.0],
 * "Mindoro fallback"), which are cosmetic starting views for an EMPTY map, not
 * a claim about where valid data may live. Deriving a hard data filter from a
 * cosmetic fallback would be inventing a magic bbox with a citation attached,
 * and it would silently discard legitimate points the first time this app is
 * pointed at a different ER server.
 *
 * So validity here is limited to what is defensible without knowing the
 * deployment's geography:
 *   1. the value is a real finite number (not null/undefined/NaN/Infinity);
 *   2. it is inside the coordinate system's own domain (|lat| <= 90,
 *      |lon| <= 180) — the definition of WGS84, not a magic number;
 *   3. it is not the exact (0,0) sentinel.
 *
 * Rule 3 is a targeted exception, and it is worth naming the tradeoff: (0,0) is
 * a real place, so this rule would drop a genuine reading taken there. That is
 * an acceptable trade for a marine-patrol system whose deployments are coastal
 * municipal waters — and the point still appears in all counts and tables
 * regardless, so nothing is lost but a camera vote.
 */

/** A coordinate pair as Leaflet orders it: [lat, lon]. */
export type LatLonPair = [number, number];
/** A coordinate pair as MapLibre/GeoJSON orders it: [lon, lat]. */
export type LonLatPair = [number, number];

/** Maximum absolute latitude in WGS84 degrees. */
const MAX_ABS_LAT = 90;
/** Maximum absolute longitude in WGS84 degrees. */
const MAX_ABS_LON = 180;

/**
 * True when `lat`/`lon` may safely contribute to a map bounds computation.
 *
 * Rejects, in order: missing values, non-finite values (NaN/Infinity — these
 * poison a bounds box into NaN and crash or blank the map), coordinates outside
 * the WGS84 domain, and the exact (0,0) Null Island sentinel.
 *
 * GEOMETRY ONLY — see this file's header. Never use this to drop an event from
 * a count, list or table.
 */
export function isValidMapCoordinate(
  lat: number | null | undefined,
  lon: number | null | undefined,
): boolean {
  if (lat === null || lat === undefined) return false;
  if (lon === null || lon === undefined) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > MAX_ABS_LAT) return false;
  if (Math.abs(lon) > MAX_ABS_LON) return false;
  // Null Island: an absent-GPS sentinel, never a real marine-patrol reading.
  if (lat === 0 && lon === 0) return false;
  return true;
}

/**
 * Keep only the entries of `points` whose coordinates are bounds-safe.
 *
 * Generic over the point shape so the same guard serves every call site
 * regardless of whether coordinates live on `lat`/`lon`, `locationLat`/
 * `locationLon`, or a tuple.
 *
 * GEOMETRY ONLY — the returned array feeds a bounds/marker computation. The
 * caller keeps the ORIGINAL, unfiltered array for counts and tables.
 */
export function filterValidMapPoints<T>(
  points: readonly T[],
  getLat: (point: T) => number | null | undefined,
  getLon: (point: T) => number | null | undefined,
): T[] {
  return points.filter((p) => isValidMapCoordinate(getLat(p), getLon(p)));
}

/**
 * Keep only the bounds-safe pairs from a `[lat, lon]` tuple list (Leaflet
 * order — `fitBounds`, `boundsToView`, `L.heatLayer`).
 *
 * A heat tuple may carry a third intensity element; the extra element is
 * preserved untouched because only the first two positions are validated.
 */
export function filterValidLatLonPairs<T extends readonly [number, number, ...number[]]>(
  pairs: readonly T[],
): T[] {
  return pairs.filter((pair) => isValidMapCoordinate(pair[0], pair[1]));
}

/**
 * Keep only the bounds-safe pairs from a `[lon, lat]` tuple list (MapLibre /
 * GeoJSON order — `LngLatBounds.extend`, `Polyline` source coordinates).
 */
export function filterValidLonLatPairs<T extends readonly [number, number, ...number[]]>(
  pairs: readonly T[],
): T[] {
  return pairs.filter((pair) => isValidMapCoordinate(pair[1], pair[0]));
}
