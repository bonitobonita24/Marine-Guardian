// municipality-assign processor.
//
// BullMQ job handler that assigns:
//   - Layer 1: a Municipality to the event/patrol row (mutually exclusive,
//     point-in-polygon using the entity's lat/lon or patrol's first track point)
//   - Layer 2: ProtectedZone rows via PatrolCoveredZone / EventCoveredZone
//     junction tables (additive, many-to-many)
//
// Design decisions:
//   - NO try/catch — exceptions propagate to BullMQ which retries with
//     exponential backoff (3 attempts, 5 s start). Same doctrine as
//     patrol-track-materialize.processor.ts.
//   - Missing target row is NOT an error: the entity may have been deleted
//     between enqueue and processing (e.g. a stale backlog drained after a
//     staging refresh). We use findUnique + skip-if-null so the job returns
//     a clean skipped result instead of throwing (findUniqueOrThrow) and
//     churning through retries + noisy failures for a row that no longer exists.
//   - Idempotent: upsert on unique constraints means re-running the job
//     with the same input converges to the same DB state.
//   - Municipalities and protected zones are loaded from DB (not from the
//     coverage-areas.ts TS file) so the processor works inside Docker
//     containers where the web package is not mounted.
//   - The patrol path reads startLocationLat/Lon (already set by er-sync
//     from the segment start coords). If null, the job silently skips to
//     avoid noise — a patrol with no location cannot be assigned.

import type { Job } from "bullmq";
import { platformPrisma } from "@marine-guardian/db";
import type { MunicipalityAssignJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import {
  assignMunicipalityByContainment,
  assignMunicipalityToDominantTrackByContainment,
  assignZonesToPoint,
  assignZonesToTrack,
  classifyPointTerrain,
  classifyTrackTerrain,
} from "@marine-guardian/shared/lib/municipality-assignment";

export interface MunicipalityAssignResult {
  entity: "patrol" | "event";
  id: string;
  municipalityId: string | null;
  zoneIds: string[];
  skipped: boolean;
  skipReason?: string;
}

export async function processMunicipalityAssign(
  job: Job<MunicipalityAssignJobPayload>,
): Promise<MunicipalityAssignResult> {
  validateTenantContext(job.data);

  const { tenantId, entity, id } = job.data;
  const now = new Date();

  // Load all municipalities + protected zones for this tenant (small, cacheable
  // by BullMQ concurrency — typically 11 municipalities + 1 zone per tenant).
  const [municipalities, zones] = await Promise.all([
    platformPrisma.municipality.findMany({
      where: { tenantId },
      select: { id: true, slug: true, name: true, boundaryGeojson: true, waterGeojson: true },
    }),
    platformPrisma.protectedZone.findMany({
      where: { tenantId },
      select: { id: true, slug: true, name: true, boundaryGeojson: true },
    }),
  ]);

  if (entity === "event") {
    const event = await platformPrisma.event.findUnique({
      where: { id },
      select: { id: true, tenantId: true, locationLat: true, locationLon: true },
    });

    if (event == null) {
      // Row deleted between enqueue and processing — skip cleanly, do not throw.
      return { entity, id, municipalityId: null, zoneIds: [], skipped: true, skipReason: "not_found" };
    }

    if (event.locationLat == null || event.locationLon == null) {
      return { entity, id, municipalityId: null, zoneIds: [], skipped: true, skipReason: "no_location" };
    }

    const point = { lat: event.locationLat, lon: event.locationLon };
    // Boundaries-only attribution (governing principle): containment, no nearest.
    const municipalityId = assignMunicipalityByContainment(point, municipalities);
    const zoneIds = assignZonesToPoint(point, zones);
    const terrain = classifyPointTerrain(point, municipalities);

    // Update event row (Layer 1)
    await platformPrisma.event.update({
      where: { id },
      data: { municipalityId, municipalityAssignedAt: now, terrain },
    });

    // Upsert junction rows (Layer 2) — idempotent
    for (const protectedZoneId of zoneIds) {
      await platformPrisma.eventCoveredZone.upsert({
        where: { eventId_protectedZoneId: { eventId: id, protectedZoneId } },
        create: { tenantId, eventId: id, protectedZoneId, assignedAt: now },
        update: { assignedAt: now },
      });
    }

    return { entity, id, municipalityId, zoneIds, skipped: false };
  }

  // ── Patrol path ──────────────────────────────────────────────────────────

  const patrol = await platformPrisma.patrol.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      startLocationLat: true,
      startLocationLon: true,
      track: { select: { trackGeojson: true } },
    },
  });

  if (patrol == null) {
    // Row deleted between enqueue and processing — skip cleanly, do not throw.
    return { entity, id, municipalityId: null, zoneIds: [], skipped: true, skipReason: "not_found" };
  }

  const trackGeojson = patrol.track?.trackGeojson ?? null;
  const hasStartLocation = patrol.startLocationLat != null && patrol.startLocationLon != null;

  if (!hasStartLocation && trackGeojson == null) {
    return { entity, id, municipalityId: null, zoneIds: [], skipped: true, skipReason: "no_start_location" };
  }

  const point = hasStartLocation
    ? { lat: patrol.startLocationLat as number, lon: patrol.startLocationLon as number }
    : undefined;

  // Layer 1 — dominant track location by CONTAINMENT ONLY (governing principle):
  // an offshore/out-of-bounds track or point stays UNATTRIBUTED (null), never
  // snapped to the nearest municipality.
  const municipalityId = trackGeojson != null
    ? assignMunicipalityToDominantTrackByContainment(trackGeojson, municipalities)
    : assignMunicipalityByContainment(point as { lat: number; lon: number }, municipalities);

  // Layer 2 — use track if materialised, fallback to single point
  const zoneIds = trackGeojson != null
    ? assignZonesToTrack(trackGeojson, zones)
    : assignZonesToPoint(point as { lat: number; lon: number }, zones);

  // Terrain — majority vote across track points when materialised, else the
  // single start-location point.
  const terrain = trackGeojson != null
    ? classifyTrackTerrain(trackGeojson, municipalities)
    : classifyPointTerrain(point as { lat: number; lon: number }, municipalities);

  // Update patrol row (Layer 1)
  await platformPrisma.patrol.update({
    where: { id },
    data: { municipalityId, municipalityAssignedAt: now, terrain },
  });

  // Upsert junction rows (Layer 2) — idempotent
  for (const protectedZoneId of zoneIds) {
    await platformPrisma.patrolCoveredZone.upsert({
      where: { patrolId_protectedZoneId: { patrolId: id, protectedZoneId } },
      create: { tenantId, patrolId: id, protectedZoneId, assignedAt: now },
      update: { assignedAt: now },
    });
  }

  return { entity, id, municipalityId, zoneIds, skipped: false };
}
