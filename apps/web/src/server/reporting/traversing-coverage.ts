/**
 * Multi-municipality traversing-patrol coverage (province rollup follow-up,
 * 2026-07-16) — generalizes `reportMap.ts`'s single-municipality
 * `sumTraversingCoverage` to a SET of member municipalities (a province
 * rollup). Exclusion is PER-MEMBER (a patrol originating in member A that
 * crosses member B is credited to B's inside-km/hours), never a blanket
 * `notIn: [all members]` — that would incorrectly drop every intra-province
 * traversal. Callers (routers) are NOT modified here — this is the shared
 * primitive only; wiring is a follow-up task.
 *
 * INVARIANT: `sumTraversingCoverageAcross(tenantId, window, [oneId])` must
 * equal today's single-municipality `sumTraversingCoverage(tenantId, input,
 * oneId)` result for the same window (same clip logic, same de-jitter guard,
 * same exclusion — just re-expressed as a one-member "set").
 */

import { prisma } from "@marine-guardian/db";
import { clipTrackToMunicipality } from "@marine-guardian/shared/lib/coverage-clip";

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

/** A resolved member municipality's territory geometry + precomputed bbox. */
export interface TraversingMember {
  id: string;
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
}

/**
 * Clips one patrol track against every member municipality OTHER than its
 * own origin, accumulating the inside-km/hours it contributes to each
 * non-origin member. Bbox-prefiltered per member before the real turf clip.
 */
export function clipTrackAcrossMembers(
  track: unknown,
  members: TraversingMember[],
  patrolMeta: TraversingPatrolMeta,
): { insideKm: number; insideHoursEst: number; traversesNonOrigin: boolean } {
  const totalHours = patrolMeta.computedDurationHours ?? patrolMeta.totalHours ?? 0;
  const cleanDistanceKm = patrolMeta.computedDistanceKm ?? patrolMeta.totalDistanceKm ?? null;

  const trackBbox = bboxOfGeojson(track);

  let insideKm = 0;
  let insideHoursEst = 0;
  let traversesNonOrigin = false;

  for (const member of members) {
    if (member.id === patrolMeta.originMunicipalityId) continue;

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

/**
 * Sums clipped in-boundary distance (km) and pro-rated hours, across a SET of
 * member municipalities (a province rollup), of every in-window patrol track
 * that traverses a non-origin member. Fetches member geometries + in-window
 * tracks ONCE, then applies `clipTrackAcrossMembers` per track. Per-member
 * exclusion (never a blanket `notIn`) preserves cross-member crediting.
 */
export async function sumTraversingCoverageAcross(
  tenantId: string,
  window: { from?: Date; to?: Date },
  municipalityIds: string[],
): Promise<{ km: number; hours: number }> {
  if (municipalityIds.length === 0) return { km: 0, hours: 0 };

  const muniRows = await prisma.municipality.findMany({
    where: { id: { in: municipalityIds } },
    select: { id: true, boundaryGeojson: true, waterGeojson: true },
  });

  const members: TraversingMember[] = muniRows.map((m) => {
    const bbox = bboxOfGeojson(m.waterGeojson ?? m.boundaryGeojson) ?? bboxOfGeojson(m.boundaryGeojson);
    return {
      id: m.id,
      landGeojson: m.boundaryGeojson,
      waterGeojson: m.waterGeojson,
      bbox,
    };
  });

  if (members.length === 0) return { km: 0, hours: 0 };

  const startTime: { gte?: Date; lte?: Date } = {};
  if (window.from) startTime.gte = window.from;
  if (window.to) startTime.lte = window.to;

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
        },
      },
    },
  });

  let km = 0;
  let hours = 0;
  for (const row of trackRows) {
    const clip = clipTrackAcrossMembers(row.trackGeojson, members, {
      originMunicipalityId: row.patrol.municipalityId,
      computedDurationHours: row.patrol.computedDurationHours,
      totalHours: row.patrol.totalHours,
      computedDistanceKm: row.patrol.computedDistanceKm,
      totalDistanceKm: row.patrol.totalDistanceKm,
    });
    km += clip.insideKm;
    hours += clip.insideHoursEst;
  }

  return { km, hours };
}
