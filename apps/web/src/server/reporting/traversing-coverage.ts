/**
 * Multi-BOUNDARY traversing-patrol coverage.
 *
 * Originally (province rollup, 2026-07-16) this generalized `reportMap.ts`'s
 * single-municipality `sumTraversingCoverage` to a SET of member
 * municipalities. It now generalizes one level further — a member may be a
 * MUNICIPALITY **or an MPA/other ZONE** — per the owner's Rule 2:
 *
 *   "if this is enabled, this means that all those patrols time and distances
 *    that passes to the selected Province/Municipality boundary or to its MPA
 *    zones must be added to the report, except for patrol count because our
 *    rule of thumb here is that the patrol count must only for the boundary
 *    where it started."
 *
 * So TIME + DISTANCE accrue for any patrol passing THROUGH the scope, and the
 * scope now includes zones. **PATROL COUNT NEVER MOVES** — a patrol is counted
 * only where it STARTED. Nothing in this module returns, derives, or mutates
 * anything count-shaped; traversing is a distance/hours-only concern.
 *
 * Exclusion is PER-MEMBER (a patrol originating in member A that crosses
 * member B is credited to B), never a blanket `notIn: [all members]` — that
 * would incorrectly drop every intra-scope traversal.
 *
 * INVARIANT: `sumTraversingCoverageAcross(tenantId, window, [oneId])` must
 * equal today's single-municipality `sumTraversingCoverage(tenantId, input,
 * oneId)` result for the same window (same clip logic, same de-jitter guard,
 * same exclusion — just re-expressed as a one-member "set").
 */

import { prisma } from "@marine-guardian/db";
import { clipTrackToMunicipality } from "@marine-guardian/shared/lib/coverage-clip";
import { isPointInAnyGeometry } from "@marine-guardian/shared/lib/municipality-assignment";

/** Cheap [minLon, minLat, maxLon, maxLat] bbox over an arbitrary GeoJSON
 *  value — canonical export so later tasks (router wiring, tests) share one
 *  implementation instead of each re-deriving reportMap.ts's local `bboxOf`.
 *  Mirrors reportMap.ts's `bboxOf` exactly. */
export function bboxOfGeojson(geojson: unknown): [number, number, number, number] | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  const walkCoords = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of node) walkCoords(child);
  };
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as {
      coordinates?: unknown;
      features?: unknown;
      geometry?: unknown;
      geometries?: unknown;
    };
    if (n.coordinates !== undefined) walkCoords(n.coordinates);
    if (Array.isArray(n.features)) for (const f of n.features) visit(f);
    if (n.geometry !== undefined) visit(n.geometry);
    if (Array.isArray(n.geometries)) for (const g of n.geometries) visit(g);
  };
  visit(geojson);
  return Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}

/** True when two [minLon, minLat, maxLon, maxLat] bboxes overlap (or touch). */
export function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** True when bbox `inner` lies entirely within bbox `outer` (inclusive). */
function bboxWithin(
  inner: [number, number, number, number],
  outer: [number, number, number, number],
): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

/** Which kind of boundary a traversing member is. */
export type TraversingMemberKind = "municipality" | "zone";

/**
 * A resolved member boundary's territory geometry + precomputed bbox.
 *
 * `kind` is OPTIONAL and defaults to `"municipality"` — existing callers
 * (`map.ts`, `get-report-map-report-data.ts`) build these object literals
 * without it and must keep compiling while the consumer migration lands in a
 * later group.
 *
 * Structurally identical to `ScopeGeometryMember` in `report-scope.ts`, which
 * is deliberately NOT imported here: `report-scope.ts` imports
 * `bboxOfGeojson` from THIS file, so importing its type back would create a
 * module cycle. `ScopeGeometryMember` (whose `kind` is required) is
 * assignable to `TraversingMember` as-is, which is what the caller migration
 * relies on.
 *
 * ZONE GEOMETRY: a `ProtectedZone` row has `boundary_geojson` only and NO
 * water column, so a zone member carries its boundary in `landGeojson` and
 * `null` in `waterGeojson`. The land ∪ water union below therefore degrades
 * to boundary-only for zones — correct, not a shortcut: an MPA polygon
 * already IS the water area.
 */
export interface TraversingMember {
  id: string;
  kind?: TraversingMemberKind;
  landGeojson: unknown;
  waterGeojson: unknown;
  bbox: [number, number, number, number] | null;
}

/** The subset of Patrol fields the clip needs, matching reportMap.ts's usage. */
export interface TraversingPatrolMeta {
  originMunicipalityId: string | null;
  computedDurationHours: number | null;
  totalHours: number | null;
  computedDistanceKm: number | null;
  totalDistanceKm: number | null;
  /**
   * Patrol.startLocationLat / .startLocationLon — where the patrol STARTED.
   *
   * A Patrol has `municipalityId` (its origin municipality) but there is NO
   * origin-ZONE column, so "did this patrol start inside this zone?" is not
   * answerable from a column. We design around that gap rather than migrate:
   * the start point is tested against each zone member's polygon in memory.
   *
   * Optional so existing callers' object literals keep compiling. When both
   * are null/absent the origin set DEGRADES to municipality-id matching only
   * (a patrol that started inside a zone may then be credited for traversing
   * that zone — accepted, and strictly no worse than today's behaviour).
   */
  startLat?: number | null;
  startLon?: number | null;
}

/** The land ∪ water geometry list for a member. `isPointInAnyGeometry` skips
 *  null/undefined entries itself, so zones (waterGeojson === null) are fine. */
function memberGeometries(member: TraversingMember): unknown[] {
  return [member.landGeojson, member.waterGeojson];
}

/**
 * Collect up to `limit` [lon, lat] vertices out of an arbitrary GeoJSON value
 * (same walker shape as `bboxOfGeojson`). Used as the sample set for the
 * cheap polygon-containment test below.
 */
function collectVertices(geojson: unknown, limit: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const walkCoords = (node: unknown): void => {
    if (out.length >= limit) return;
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      out.push([lon, lat]);
      return;
    }
    for (const child of node) walkCoords(child);
  };
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as {
      coordinates?: unknown;
      features?: unknown;
      geometry?: unknown;
      geometries?: unknown;
    };
    if (n.coordinates !== undefined) walkCoords(n.coordinates);
    if (Array.isArray(n.features)) for (const f of n.features) visit(f);
    if (n.geometry !== undefined) visit(n.geometry);
    if (Array.isArray(n.geometries)) for (const g of n.geometries) visit(g);
  };
  visit(geojson);
  return out;
}

/** Vertex-sample budget for the containment test — real MPA rings are far
 *  smaller than this, and the candidate sets are tiny (8 zones tenant-wide in
 *  dev), so the whole matrix is a few hundred point-in-polygon tests. */
const CONTAINMENT_SAMPLE_LIMIT = 400;

/**
 * True when `inner`'s territory lies inside `outer`'s territory.
 *
 * Necessary condition first (bbox containment, exact and free), then every
 * sampled vertex of `inner` must fall inside `outer`'s land ∪ water polygons.
 *
 * APPROXIMATION, stated plainly: vertex sampling can theoretically miss a
 * concave outer boundary that excludes an edge midpoint while containing
 * every vertex. A true geometric difference is not available in this package
 * (see the DE-OVERLAP note on `clipTrackAcrossMembers`). For the real shapes
 * this exists to handle — an MPA zone nested inside its parent municipality —
 * it is exact.
 */
function isMemberContainedIn(inner: TraversingMember, outer: TraversingMember): boolean {
  if (inner.bbox !== null && outer.bbox !== null && !bboxWithin(inner.bbox, outer.bbox)) {
    return false;
  }
  const vertices = collectVertices(inner.landGeojson, CONTAINMENT_SAMPLE_LIMIT);
  if (vertices.length === 0) return false;
  const outerGeometries = memberGeometries(outer);
  for (const [lon, lat] of vertices) {
    if (!isPointInAnyGeometry({ lat, lon }, outerGeometries)) return false;
  }
  return true;
}

/**
 * Pairwise containment relation over a member set: `containedIn.get(innerId)`
 * is the set of member ids whose territory fully contains `inner`.
 *
 * Track-independent, so it is built ONCE per member set and reused for every
 * patrol track (see `sumTraversingCoverageAcrossMembers`).
 */
export interface MemberContainment {
  containedIn: Map<string, Set<string>>;
}

export function buildMemberContainment(members: TraversingMember[]): MemberContainment {
  const containedIn = new Map<string, Set<string>>();
  for (const inner of members) {
    const containers = new Set<string>();
    for (const outer of members) {
      if (outer.id === inner.id) continue;
      if (isMemberContainedIn(inner, outer)) containers.add(outer.id);
    }
    containedIn.set(inner.id, containers);
  }
  return { containedIn };
}

/**
 * The member ids a given patrol ORIGINATED in — the set that must never be
 * credited for "traversing".
 *
 * = { the member whose id === originMunicipalityId }
 *   ∪ { every ZONE member whose polygon CONTAINS the patrol's start point }.
 *
 * The zone half exists because there is no origin-zone column (see
 * `TraversingPatrolMeta.startLat`). Candidate zone sets are tiny (8 zones
 * tenant-wide in dev), so an in-memory containment test per patrol is cheap.
 */
export function resolveOriginMemberIds(
  members: TraversingMember[],
  patrolMeta: TraversingPatrolMeta,
): Set<string> {
  const originIds = new Set<string>();
  for (const member of members) {
    if (patrolMeta.originMunicipalityId !== null && member.id === patrolMeta.originMunicipalityId) {
      originIds.add(member.id);
    }
  }

  const { startLat, startLon } = patrolMeta;
  if (
    typeof startLat !== "number" ||
    typeof startLon !== "number" ||
    !Number.isFinite(startLat) ||
    !Number.isFinite(startLon)
  ) {
    // DEGRADED PATH — no start coordinates recorded. Municipality-id
    // exclusion only; a zone the patrol actually started inside cannot be
    // detected and may be credited as traversed.
    return originIds;
  }

  for (const member of members) {
    if ((member.kind ?? "municipality") !== "zone") continue;
    if (originIds.has(member.id)) continue;
    if (isPointInAnyGeometry({ lat: startLat, lon: startLon }, memberGeometries(member))) {
      originIds.add(member.id);
    }
  }
  return originIds;
}

/**
 * Clips one patrol track against every member boundary OTHER than the ones it
 * originated in, accumulating the inside-km/hours it contributes. Bbox
 * -prefiltered per member before the real turf clip.
 *
 * DE-OVERLAP — the reason this is not a plain per-member sum any more.
 * Summing per member was safe ONLY because municipalities never overlap. A
 * child ZONE **does** overlap its parent municipality, so a naive sum credits
 * the same kilometres twice (this fires on Calapan City / Harka Piloto, which
 * is contained; it does NOT fire on Sablayan / Apo Reef, which is
 * geometrically disjoint — a test on Apo Reef alone would not catch it).
 *
 * The de-overlap rule applied here is CONTAINMENT-BASED:
 *   1. members the patrol originated in are dropped (never self-credit);
 *   2. a member fully CONTAINED in an origin member is dropped — its
 *      kilometres lie inside the patrol's own origin territory;
 *   3. of two candidates where one contains the other, the CONTAINER is kept
 *      and the contained one dropped — the container's clip already covers it;
 *   4. the survivors are pairwise non-nested, so summing them is safe, exactly
 *      as it always was for municipalities.
 *
 * This is exact for the two real shapes (nested zone, disjoint zone) and for
 * every municipality set. It is NOT exact for a PARTIAL overlap between two
 * members, which would still double-count the shared sliver. The exact fix is
 * per-segment coverage masks (union the masks, subtract the origin masks,
 * derive km once) — that requires returning a segment mask from
 * `clipTrackToMunicipality`, which lives in `packages/shared/src/lib/
 * coverage-clip/` and is OUT OF SCOPE for this slice. `apps/web` also has no
 * `@turf/*` dependency of its own, so the segment geometry cannot be computed
 * here. See the handoff note for the follow-up slice.
 */
export function clipTrackAcrossMembers(
  track: unknown,
  members: TraversingMember[],
  patrolMeta: TraversingPatrolMeta,
  containment?: MemberContainment,
): { insideKm: number; insideHoursEst: number; traversesNonOrigin: boolean } {
  const totalHours = patrolMeta.computedDurationHours ?? patrolMeta.totalHours ?? 0;
  const cleanDistanceKm = patrolMeta.computedDistanceKm ?? patrolMeta.totalDistanceKm ?? null;

  const trackBbox = bboxOfGeojson(track);

  const originIds = resolveOriginMemberIds(members, patrolMeta);
  const candidates = members.filter((m) => !originIds.has(m.id));

  const relation = containment ?? buildMemberContainment(members);
  const candidateIds = new Set(candidates.map((m) => m.id));

  const creditable = candidates.filter((candidate) => {
    const containers = relation.containedIn.get(candidate.id);
    if (containers === undefined || containers.size === 0) return true;

    // (2) contained in an origin member → its km is the patrol's own origin km.
    for (const containerId of containers) {
      if (originIds.has(containerId)) return false;
    }

    // (3) contained in another CANDIDATE → the container's clip already covers
    // it. Mutual containment (identical polygons) is broken deterministically
    // by id order so exactly one of the pair survives.
    for (const containerId of containers) {
      if (!candidateIds.has(containerId)) continue;
      const reverse = relation.containedIn.get(containerId);
      const mutual = reverse !== undefined && reverse.has(candidate.id);
      if (!mutual || containerId < candidate.id) return false;
    }
    return true;
  });

  let insideKm = 0;
  let insideHoursEst = 0;
  let traversesNonOrigin = false;

  for (const member of creditable) {
    if (member.bbox !== null && trackBbox !== null && !bboxesOverlap(trackBbox, member.bbox)) {
      continue;
    }

    const clip = clipTrackToMunicipality(
      track,
      { landGeojson: member.landGeojson, waterGeojson: member.waterGeojson ?? undefined },
      totalHours,
      cleanDistanceKm,
    );

    if (clip.traverses) {
      insideKm += clip.insideKm;
      insideHoursEst += clip.insideHoursEst;
      traversesNonOrigin = true;
    }
  }

  return { insideKm, insideHoursEst, traversesNonOrigin };
}

/** Window filter shared by both sum entry points. */
export interface TraversingWindow {
  from?: Date;
  to?: Date;
}

/**
 * Sums clipped in-boundary distance (km) and pro-rated hours across a
 * PRE-RESOLVED member set — municipalities, zones, or both. This is the entry
 * point the migrated consumers use: they pass the output of
 * `loadScopeGeometries` (`report-scope.ts`), which already applies the
 * smallest-explicit-boundary rule (a zone-level scope returns ZONE members
 * only and never the parent municipality).
 *
 * Fetches in-window tracks ONCE and builds the containment relation ONCE,
 * then applies `clipTrackAcrossMembers` per track. Distance/hours only — no
 * patrol count is produced or affected here (owner Rule 2).
 */
export async function sumTraversingCoverageAcrossMembers(
  tenantId: string,
  window: TraversingWindow,
  members: TraversingMember[],
): Promise<{ km: number; hours: number }> {
  if (members.length === 0) return { km: 0, hours: 0 };

  const startTime: { gte?: Date; lte?: Date } = {};
  if (window.from !== undefined) startTime.gte = window.from;
  if (window.to !== undefined) startTime.lte = window.to;

  const trackRows = await prisma.patrolTrack.findMany({
    where: {
      tenantId,
      patrol: {
        tenantId,
        isDeleted: false,
        isTestPatrol: false,
        ...(startTime.gte !== undefined || startTime.lte !== undefined ? { startTime } : {}),
      },
    },
    select: {
      trackGeojson: true,
      patrol: {
        select: {
          municipalityId: true,
          totalHours: true,
          computedDurationHours: true,
          computedDistanceKm: true,
          totalDistanceKm: true,
          startLocationLat: true,
          startLocationLon: true,
        },
      },
    },
  });

  const containment = buildMemberContainment(members);

  let km = 0;
  let hours = 0;
  for (const row of trackRows) {
    const clip = clipTrackAcrossMembers(
      row.trackGeojson,
      members,
      {
        originMunicipalityId: row.patrol.municipalityId,
        computedDurationHours: row.patrol.computedDurationHours,
        totalHours: row.patrol.totalHours,
        computedDistanceKm: row.patrol.computedDistanceKm,
        totalDistanceKm: row.patrol.totalDistanceKm,
        startLat: row.patrol.startLocationLat,
        startLon: row.patrol.startLocationLon,
      },
      containment,
    );
    km += clip.insideKm;
    hours += clip.insideHoursEst;
  }

  return { km, hours };
}

/**
 * Municipality-resolving wrapper, kept at its ORIGINAL signature so current
 * callers (`reportMap.ts`) are unaffected while the consumer migration lands
 * in a later group. Resolves the ids to municipality members, then delegates
 * to `sumTraversingCoverageAcrossMembers`.
 */
export async function sumTraversingCoverageAcross(
  tenantId: string,
  window: TraversingWindow,
  municipalityIds: string[],
): Promise<{ km: number; hours: number }> {
  if (municipalityIds.length === 0) return { km: 0, hours: 0 };

  const muniRows = await prisma.municipality.findMany({
    where: { id: { in: municipalityIds } },
    select: { id: true, boundaryGeojson: true, waterGeojson: true },
  });

  const members: TraversingMember[] = muniRows.map((m) => {
    const bbox =
      bboxOfGeojson(m.waterGeojson ?? m.boundaryGeojson) ?? bboxOfGeojson(m.boundaryGeojson);
    return {
      id: m.id,
      kind: "municipality",
      landGeojson: m.boundaryGeojson,
      waterGeojson: m.waterGeojson,
      bbox,
    };
  });

  if (members.length === 0) return { km: 0, hours: 0 };

  return sumTraversingCoverageAcrossMembers(tenantId, window, members);
}
