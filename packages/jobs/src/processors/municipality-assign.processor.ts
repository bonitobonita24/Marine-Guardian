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
  assignMunicipalityToPointOrNearest,
  assignMunicipalityToDominantTrack,
  assignZonesToPoint,
  assignZonesToTrack,
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
      select: { id: true, slug: true, name: true, boundaryGeojson: true },
    }),
    platformPrisma.protectedZone.findMany({
      where: { tenantId },
      select: { id: true, slug: true, name: true, boundaryGeojson: true },
    }),
  ]);

  if (entity === "event") {
    const event = await platformPrisma.event.findUniqueOrThrow({
      where: { id },
      select: { id: true, tenantId: true, locationLat: true, locationLon: true },
    });

    if (event.locationLat == null || event.locationLon == null) {
      return { entity, id, municipalityId: null, zoneIds: [], skipped: true, skipReason: "no_location" };
    }

    const point = { lat: event.locationLat, lon: event.locationLon };
    const municipalityId = assignMunicipalityToPointOrNearest(point, municipalities);
    const zoneIds = assignZonesToPoint(point, zones);

    // Update event row (Layer 1)
    await platformPrisma.event.update({
      where: { id },
      data: { municipalityId, municipalityAssignedAt: now },
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

  const patrol = await platformPrisma.patrol.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      startLocationLat: true,
      startLocationLon: true,
      track: { select: { trackGeojson: true } },
    },
  });

  const trackGeojson = patrol.track?.trackGeojson ?? null;
  const hasStartLocation = patrol.startLocationLat != null && patrol.startLocationLon != null;

  if (!hasStartLocation && trackGeojson == null) {
    return { entity, id, municipalityId: null, zoneIds: [], skipped: true, skipReason: "no_start_location" };
  }

  const point = hasStartLocation
    ? { lat: patrol.startLocationLat as number, lon: patrol.startLocationLon as number }
    : undefined;

  // Layer 1 — dominant track location (falls back to the nearest municipality
  // when there's no usable track or the track yields no in-municipality points).
  const municipalityId = trackGeojson != null
    ? assignMunicipalityToDominantTrack(trackGeojson, municipalities, point)
    : assignMunicipalityToPointOrNearest(point as { lat: number; lon: number }, municipalities);

  // Layer 2 — use track if materialised, fallback to single point
  const zoneIds = trackGeojson != null
    ? assignZonesToTrack(trackGeojson, zones)
    : assignZonesToPoint(point as { lat: number; lon: number }, zones);

  // Update patrol row (Layer 1)
  await platformPrisma.patrol.update({
    where: { id },
    data: { municipalityId, municipalityAssignedAt: now },
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
