/**
 * municipality-attribution — BACKFILL-ONLY pure logic for a one-time historical
 * cleanup of unattributed (municipalityId = null) patrols/events.
 *
 * This package is DELIBERATELY SEPARATE from `../municipality-assignment`
 * (the live processor pipeline). It is never wired into a processor and must
 * never be imported by one — it exists only to be driven by a one-off backfill
 * script under human/owner supervision. Reuses turf primitives from
 * municipality-assignment by import, not by duplication.
 *
 * NO try/catch — callers own error handling.
 */

import pointToPolygonDistance from "@turf/point-to-polygon-distance";
import { point as turfPoint } from "@turf/helpers";
import type { MunicipalityForAssignment } from "../municipality-assignment/types";

/**
 * Unwrap a GeoJSON value for use with turf predicates — same shape handling as
 * `municipality-assignment`'s private `unwrapGeojson()`. The boundary GeoJSON
 * stored in the DB (and on disk) is a FeatureCollection wrapping a single
 * Feature; turf's distance function works on Feature or Geometry, not
 * FeatureCollection, so we extract the first Feature.
 */
function unwrapGeojson(raw: unknown): GeoJSON.Feature | GeoJSON.Geometry {
  const g = raw as { type?: string; features?: GeoJSON.Feature[] };
  if (g.type === "FeatureCollection" && Array.isArray(g.features) && g.features.length > 0) {
    return g.features[0] as GeoJSON.Feature;
  }
  return raw as GeoJSON.Feature | GeoJSON.Geometry;
}

// ── Part 1 — Title-hint matcher (patrols only) ───────────────────────────────

/**
 * Whitelist of title tokens that reliably identify a single municipality in
 * historical patrol titles. Each entry was measured against 4,597
 * geometry-attributed patrols and holds >= 97% precision. Evaluated in
 * DECLARED ORDER so full words are checked before abbreviations they could
 * otherwise shadow (e.g. "calintaan" must be evaluated before "cal", since
 * "cal" is a substring-adjacent risk inside "Calintaan").
 *
 * DELIBERATELY EXCLUDED — do not re-add:
 *   - "baco"    (51.7% — real Baco/Calapan start-point conflict, not reliable)
 *   - "mam"     (0% true positives / 190 false positives — every occurrence is
 *                the ranger's given name "Mamerto", never the municipality)
 *   - "rox"     (58% — too weak)
 *   - "roxas" / "dumaran" / "araceli" as SOLE bare-word evidence in an
 *     "origin to destination" style title (48–65% — contaminated by transit
 *     phrasing where the named municipality is not necessarily the patrol's
 *     municipality)
 *   - "sab"     (unproven, n=11 — too small a sample; the full word
 *                "sablayan" is matched instead)
 */
export const TITLE_HINT_WHITELIST: ReadonlyArray<{ hint: string; slug: string }> = [
  // full words are evaluated FIRST so they can never be shadowed by an abbreviation
  { hint: "calintaan", slug: "calintaan" }, // 99%+ — must precede "cal"
  { hint: "sablayan", slug: "sablayan" }, // 99.4%
  { hint: "tacligan", slug: "san-teodoro" }, // 98.5%
  // abbreviations (all measured >= 97% against 4,597 geometry-attributed patrols)
  { hint: "pg", slug: "puerto-galera" }, // 99.3%
  { hint: "adi", slug: "abra-de-ilog" }, // 99.1%
  { hint: "st", slug: "san-teodoro" }, // 98.1%
  { hint: "cal", slug: "calapan-city" }, // 98.1%
  { hint: "ara", slug: "araceli" }, // 97.2%
  { hint: "dum", slug: "dumaran" }, // 97.4%
];

/**
 * Minimum trimmed title length required before attempting a hint match.
 * Rejects bare "ST"/"PG" (2 chars) and tokenization artifacts like "Tèst
 * only" fragments — checked BEFORE any matching is attempted.
 */
export const MIN_TITLE_LENGTH = 5;

export interface TitleHintResult {
  slug: string;
  hint: string;
}

/**
 * Escape a string for safe use inside a RegExp source.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a historical patrol title against the whole-token hint whitelist.
 *
 * Whole-token matching ONLY: a hint is considered matched only when it is
 * delimited by a non-word character (not a Unicode letter/digit) or a string
 * boundary, using the boundary class `[^\p{L}\p{N}]` (NOT JavaScript's `\b`,
 * which does not break between a letter and a digit — `\b` would wrongly
 * match "PG01" as "pg"; and NOT the ASCII-only `[^a-z0-9]`, which would wrongly
 * treat a non-ASCII letter like "è" as a delimiter and match "st" inside
 * "Tèst"). Case-insensitive.
 *
 * Rules enforced (in order):
 *   1. null/empty title → null.
 *   2. `title.trim().length < MIN_TITLE_LENGTH` → null.
 *   3. Collect every whitelist entry whose hint whole-token-matches, in
 *      DECLARED ORDER. Dedupe the matches by SLUG (not by hint) — e.g. "st"
 *      and "tacligan" both map to "san-teodoro"; a title containing both is
 *      ONE distinct municipality and is accepted.
 *   4. If the number of DISTINCT SLUGS is not exactly 1 → null (covers both
 *      "no hint matched" and "hints imply >1 municipality" ambiguous cases).
 *   5. Otherwise return { slug, hint } where `hint` is the FIRST matching
 *      whitelist entry's hint (declared-order precedence, so full words beat
 *      abbreviations when both are present for the same slug).
 */
export function matchTitleHint(title: string | null | undefined): TitleHintResult | null {
  if (title == null) return null;

  const trimmed = title.trim();
  if (trimmed.length < MIN_TITLE_LENGTH) return null;

  const lower = trimmed.toLowerCase();

  const matches: TitleHintResult[] = [];
  for (const entry of TITLE_HINT_WHITELIST) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(entry.hint)}([^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    if (pattern.test(lower)) {
      matches.push({ slug: entry.slug, hint: entry.hint });
    }
  }

  if (matches.length === 0) return null;

  const distinctSlugs = new Set(matches.map((m) => m.slug));
  if (distinctSlugs.size !== 1) return null;

  // matches is already in declared-order — the first entry's hint wins.
  return matches[0] ?? null;
}

// ── Part 2 — Ranked nearest-municipality with distance (patrols AND events) ──

/**
 * Default distance cap (kilometres, inclusive) for `nearestWithinCap`.
 */
export const NEAREST_CAP_KM = 45;

/**
 * Garbage-coordinate guard threshold (kilometres). A winner distance at or
 * beyond this value is treated as a data-quality failure (e.g. patrols
 * recorded in Marseille/Indonesia) regardless of any caller-supplied cap.
 */
export const GARBAGE_COORD_KM = 100;

export interface NearestResult {
  municipalityId: string;
  distanceKm: number;
  /** true when a runner-up exists within max(2km, 10% of winner distance) */
  ambiguous: boolean;
}

/**
 * Structural coordinate validity check — catches records that must NEVER be
 * attributed regardless of distance cap: exact (0,0) null-island sentinels,
 * non-finite values, or out-of-range lat/lon.
 */
function isStructurallyValidCoordinate(point: { lat: number; lon: number }): boolean {
  const { lat, lon } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (Math.abs(lat) > 90) return false;
  if (Math.abs(lon) > 180) return false;
  return true;
}

/**
 * Find the nearest municipality (by LAND polygon `boundaryGeojson` distance
 * only — deliberately NOT `waterGeojson` for this backfill), ranked with a
 * runner-up ambiguity flag, subject to a garbage-coordinate guard and a
 * distance cap.
 *
 * @param point - { lat, lon } — WGS-84 decimal degrees
 * @param municipalities - array loaded from DB (one per tenant)
 * @param capKm - inclusive distance cap in km; defaults to NEAREST_CAP_KM
 * @returns the nearest municipality within the cap, or null when: the
 *   coordinate is structurally invalid, the municipality list is empty, the
 *   winner is >= GARBAGE_COORD_KM away (explicit garbage-coordinate guard),
 *   or the winner is beyond `capKm`.
 */
export function nearestWithinCap(
  point: { lat: number; lon: number },
  municipalities: MunicipalityForAssignment[],
  capKm: number = NEAREST_CAP_KM,
): NearestResult | null {
  if (municipalities.length === 0) return null;
  if (!isStructurallyValidCoordinate(point)) return null;

  const tPoint = turfPoint([point.lon, point.lat]);

  const ranked = municipalities
    .map((muni) => {
      const geojson = unwrapGeojson(muni.boundaryGeojson);
      const distanceKm = Math.abs(
        pointToPolygonDistance(
          tPoint,
          geojson as Parameters<typeof pointToPolygonDistance>[1],
          { units: "kilometers" },
        ),
      );
      return { municipalityId: muni.id, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const winner = ranked[0];
  if (winner == null) return null;

  // Explicit garbage-coordinate guard — independent of any caller-supplied cap.
  if (winner.distanceKm >= GARBAGE_COORD_KM) return null;

  // Cap is inclusive.
  if (winner.distanceKm > capKm) return null;

  const runnerUp = ranked[1];
  const ambiguous =
    runnerUp != null &&
    runnerUp.distanceKm - winner.distanceKm <= Math.max(2, winner.distanceKm * 0.1);

  return {
    municipalityId: winner.municipalityId,
    distanceKm: winner.distanceKm,
    ambiguous,
  };
}
