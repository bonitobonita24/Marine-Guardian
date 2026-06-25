/**
 * 5.2a — Patrol Track Materialization helper.
 *
 * Fetches a patrol's GPS track from EarthRanger and atomically upserts the
 * resulting GeoJSON FeatureCollection into the PatrolTrack table, keyed on
 * patrolId (unique). Idempotent: re-running for the same patrol overwrites
 * the existing row (per v2 PRODUCT.md §1043 refresh predicate).
 *
 * Refresh predicate (v2 PRODUCT.md §1043):
 *   needs_refetch(patrol) === true when:
 *     (a) no PatrolTrack row exists for the patrol, OR
 *     (b) patrolEnded === false in the local PatrolTrack (still active), OR
 *     (c) patrolEnded === false locally but the live patrol's endTime is
 *         now set (patrol just ended).
 * This helper itself is unconditional — it always fetches + upserts when
 * called. The refresh predicate lives at the call site (5.2b processor
 * dedupe via jobId + 5.2c admin manual rebuild).
 *
 * Skip behavior (no exception thrown — observability via result.skipped):
 *   - skipped=no_credentials: tenant has no earthrangerUrl or token configured
 *   - skipped=no_segment: patrol has no segments (rare — ER patrols typically
 *     always carry at least one segment)
 *   - skipped=no_leader: segment[0].leaderErId is null (patrol has segment
 *     but no leader subject assigned — track fetch would have nothing to query)
 *
 * NO AuditLog write — automatic materialization (5.2b sync-driven enqueue)
 * has no user. Per Option A scope split, 5.2c admin manual-rebuild owns
 * AuditLog where ctx.session.userId is available.
 *
 * Architectural placement: lives in @marine-guardian/jobs (not apps/web)
 * because the 5.2b BullMQ processor consumes it directly. apps/web (5.2c
 * admin tRPC mutation) consumes it via the @marine-guardian/jobs package
 * boundary (same arc as 5.1c area-derivation relocation).
 *
 * Relocated from apps/web/src/server/sync/patrol-track-materialization.ts
 * at 5.2a ship time via git mv (history preserved).
 */

import type { ExtendedPrismaClient } from "@marine-guardian/db";
import { decrypt, platformPrisma } from "@marine-guardian/db";
import {
  EarthRangerClient,
  type ErTrackResponse,
  type ErTrackFeature,
} from "./earthranger-client";

/**
 * Prisma client type accepted by materializePatrolTrack. Aliased to the
 * tenant-guarded `ExtendedPrismaClient` exported from `@marine-guardian/db`
 * so production callers pass the real client and tests pass a structurally
 * compatible mock (via `as unknown as PrismaClientLike`).
 */
export type PrismaClientLike = ExtendedPrismaClient;

export type MaterializationSkipReason =
  | "no_credentials"
  | "no_segment"
  | "no_leader";

export interface MaterializationResult {
  /** PatrolTrack.id of the upserted row. Null when skipped. */
  patrolTrackId: string | null;
  /** Number of coordinates summed across all LineString features. */
  pointCount: number;
  /** Whether every point carried a timestamp in coordinateProperties.times. */
  hasTimestamps: boolean;
  /** Latest timestamp observed across all features. Null when hasTimestamps=false. */
  lastTrackTime: Date | null;
  /** Mirrors Patrol.endTime — true iff the patrol has ended at fetch time. */
  patrolEnded: boolean;
  /** True when the function short-circuited without calling ER or writing. */
  skipped: boolean;
  /** Populated only when skipped=true. */
  skipReason?: MaterializationSkipReason;
}

interface PatrolForMaterialization {
  id: string;
  tenantId: string;
  startTime: Date | null;
  endTime: Date | null;
  segments: {
    leaderErId: string | null;
    actualStart: Date | null;
    actualEnd: Date | null;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
  }[];
}

function pickTimeRange(
  patrol: PatrolForMaterialization,
): { since: Date; until: Date } | null {
  // Prefer the segment's actual range (real GPS coverage window), fall back
  // to scheduled, then patrol-level start/end. Returns null only when no
  // since timestamp can be resolved (very rare — ER patrols always carry
  // at least scheduledStart).
  const seg = patrol.segments[0];
  const since =
    seg?.actualStart ?? seg?.scheduledStart ?? patrol.startTime ?? null;
  if (since === null) return null;
  const until =
    seg?.actualEnd ?? seg?.scheduledEnd ?? patrol.endTime ?? new Date();
  return { since, until };
}

interface FeatureSummary {
  pointCount: number;
  hasTimestamps: boolean;
  lastTrackTime: Date | null;
}

function summariseFeatures(features: ErTrackFeature[]): FeatureSummary {
  let pointCount = 0;
  let hasTimestamps = features.length > 0;
  let lastTrackTime: Date | null = null;

  for (const feature of features) {
    const coords = feature.geometry.coordinates;
    pointCount += coords.length;
    const times = feature.properties.coordinateProperties?.times;
    if (times === undefined || times.length !== coords.length) {
      // A single feature missing or having an inconsistent timestamp count
      // flips the whole track to "no reliable timestamps". Defensive — ER
      // typically always emits timestamps, but a partial response should
      // not silently lie about temporal coverage.
      hasTimestamps = false;
      continue;
    }
    for (const t of times) {
      const parsed = new Date(t);
      if (Number.isNaN(parsed.getTime())) {
        hasTimestamps = false;
        continue;
      }
      if (lastTrackTime === null || parsed > lastTrackTime) {
        lastTrackTime = parsed;
      }
    }
  }

  if (!hasTimestamps) {
    lastTrackTime = null;
  }
  return { pointCount, hasTimestamps, lastTrackTime };
}

export async function materializePatrolTrack(
  prisma: PrismaClientLike,
  patrolId: string,
): Promise<MaterializationResult> {
  // Step 1 — load patrol + first segment.
  const patrol: PatrolForMaterialization = await prisma.patrol.findUniqueOrThrow({
    where: { id: patrolId },
    select: {
      id: true,
      tenantId: true,
      startTime: true,
      endTime: true,
      segments: {
        select: {
          leaderErId: true,
          actualStart: true,
          actualEnd: true,
          scheduledStart: true,
          scheduledEnd: true,
        },
        orderBy: { scheduledStart: "asc" },
        take: 1,
      },
    },
  });

  const patrolEnded = patrol.endTime !== null;

  if (patrol.segments.length === 0) {
    return {
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded,
      skipped: true,
      skipReason: "no_segment",
    };
  }

  const leaderErId = patrol.segments[0]?.leaderErId ?? null;
  if (leaderErId === null) {
    return {
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded,
      skipped: true,
      skipReason: "no_leader",
    };
  }

  // Step 2 — resolve tenant ER credentials from the canonical
  // tenant_er_connections table (written by the Settings UI). The legacy
  // Tenant.earthrangerUrl / earthrangerDasToken columns are never populated by
  // the UI, so reading them left every materialize job permanently
  // skipped:no_credentials despite a saved, verified connection. Mirrors the
  // 2026-06-21 er-sync.processor.ts hotfix.
  const conn = await platformPrisma.tenantErConnection.findUnique({
    where: { tenantId: patrol.tenantId },
    select: {
      baseUrl: true,
      apiTokenEnc: true,
    },
  });

  if (conn === null) {
    return {
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded,
      skipped: true,
      skipReason: "no_credentials",
    };
  }

  const erUrl = conn.baseUrl;
  const dasToken = decrypt(conn.apiTokenEnc);
  const client = new EarthRangerClient(erUrl, dasToken);

  // Step 3 — resolve time range, fetch tracks.
  const range = pickTimeRange(patrol);
  if (range === null) {
    // Segment present but carries no usable time references. Rare.
    return {
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded,
      skipped: true,
      skipReason: "no_segment",
    };
  }

  const trackResponse: ErTrackResponse = await client.fetchSubjectTracks(
    leaderErId,
    range.since.toISOString(),
    range.until.toISOString(),
  );

  // Step 4 — summarise + upsert.
  const summary = summariseFeatures(trackResponse.features);
  const fetchedAt = new Date();

  // PatrolTrack.trackGeojson is Prisma Json — narrow the FeatureCollection
  // to a plain object via unknown. Runtime shape is JSON-safe.
  const trackJson = trackResponse as unknown as Record<string, unknown>;

  const upserted = await prisma.patrolTrack.upsert({
    where: { patrolId: patrol.id },
    create: {
      tenantId: patrol.tenantId,
      patrolId: patrol.id,
      subjectId: null,
      since: range.since,
      until: range.until,
      trackGeojson: trackJson,
      hasTimestamps: summary.hasTimestamps,
      pointCount: summary.pointCount,
      lastTrackTime: summary.lastTrackTime,
      patrolEnded,
      source: "er_api",
      fetchedAt,
    },
    update: {
      since: range.since,
      until: range.until,
      trackGeojson: trackJson,
      hasTimestamps: summary.hasTimestamps,
      pointCount: summary.pointCount,
      lastTrackTime: summary.lastTrackTime,
      patrolEnded,
      source: "er_api",
      fetchedAt,
    },
  });

  return {
    patrolTrackId: upserted.id,
    pointCount: summary.pointCount,
    hasTimestamps: summary.hasTimestamps,
    lastTrackTime: summary.lastTrackTime,
    patrolEnded,
    skipped: false,
  };
}

// ---------------------------------------------------------------------------
// recomputeDistanceAndDuration (A2.1)
// ---------------------------------------------------------------------------

export interface RecomputeResult {
  computedDistanceKm: number;
  computedDurationHours: number;
  pointCount: number;
}

/**
 * Haversine great-circle distance between two [lon, lat] points in kilometres.
 * R = 6371 km.
 */
function haversineKm(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * Reads the stored PatrolTrack GeoJSON for a patrol, recomputes
 * `computedDistanceKm` and `computedDurationHours` from the coordinates +
 * timestamps, then writes them back to the Patrol row.
 *
 * No-op (returns zeros, skips Patrol.update) when:
 *   - no PatrolTrack row exists for the patrolId, OR
 *   - trackGeojson is null / empty.
 *
 * Distance: pairwise haversine sum within each LineString feature.
 *   Endpoints across separate features are NOT connected.
 * Duration: |maxTime − minTime| across all coordinateProperties.times arrays.
 *   Falls back to 0 when no times are present.
 */
export async function recomputeDistanceAndDuration(
  prisma: PrismaClientLike,
  patrolId: string,
): Promise<RecomputeResult> {
  const zero: RecomputeResult = {
    computedDistanceKm: 0,
    computedDurationHours: 0,
    pointCount: 0,
  };

  // Step 1 — load the PatrolTrack row.
  const row = await prisma.patrolTrack.findUnique({ where: { patrolId } });
  if (row?.trackGeojson == null) {
    return zero;
  }

  // Step 2 — parse the stored GeoJSON (Prisma Json comes back as unknown).
  const fc = row.trackGeojson as unknown as ErTrackResponse;
  const features = fc.features;
  if (features.length === 0) {
    return zero;
  }

  // Step 3 — accumulate distance, duration anchors, and point count.
  let computedDistanceKm = 0;
  let pointCount = 0;
  const allTimestamps: number[] = [];

  for (const feature of features) {
    const coords = feature.geometry.coordinates as Array<[number, number]>;
    pointCount += coords.length;

    // Pairwise haversine within this feature only.
    for (let i = 1; i < coords.length; i++) {
      computedDistanceKm += haversineKm(
        coords[i - 1] as [number, number],
        coords[i] as [number, number],
      );
    }

    // Collect timestamps if present.
    const times: unknown[] =
      (feature.properties as { coordinateProperties?: { times?: unknown[] } })
        .coordinateProperties?.times ?? [];
    for (const t of times) {
      if (typeof t === "string" && t.length > 0) {
        const ms = Date.parse(t);
        if (!isNaN(ms)) allTimestamps.push(ms);
      }
    }
  }

  // Step 4 — duration from timestamp spread.
  let computedDurationHours = 0;
  if (allTimestamps.length >= 2) {
    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    computedDurationHours = Math.abs(maxTime - minTime) / 3_600_000;
  }

  // Step 5 — write back to Patrol.
  await prisma.patrol.update({
    where: { id: patrolId },
    data: { computedDistanceKm, computedDurationHours },
  });

  return { computedDistanceKm, computedDurationHours, pointCount };
}
