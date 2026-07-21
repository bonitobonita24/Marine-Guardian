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
//     from the segment start coords). If null, it falls back to the FIRST
//     coordinate of the materialised track (firstTrackPoint) — the start point
//     is the same, only the source differs. A patrol with neither a start
//     location nor a track row is skipped (no point can be derived); no point
//     is ever invented for it.
//   - municipalityAttributionMethod records HOW municipalityId was resolved.
//     Both start-point sources run through assignMunicipalityByContainment, so
//     a resolved municipality is always "containment"; an unattributed row
//     (start outside every boundary) records null, never a false claim. A
//     manual override keeps its existing method — the anti-clobber guard skips
//     the whole Layer-1 write.

import type { Job } from "bullmq";
import { platformPrisma } from "@marine-guardian/db";
import type { MunicipalityAssignJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import {
  assignMunicipalityByContainment,
  assignZonesToPoint,
  assignZonesToTrack,
  classifyPointTerrain,
  classifyTrackTerrain,
  firstTrackPoint,
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
      select: {
        id: true,
        tenantId: true,
        locationLat: true,
        locationLon: true,
        municipalityId: true,
        // Anti-clobber key. Unlike Patrol (which carries a dedicated
        // `municipalityManual` boolean), an Event records its override purely
        // through the provenance enum — "manual" IS the lock. No redundant
        // boolean is added: one column, one source of truth.
        municipalityAttributionMethod: true,
      },
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

    // Update event row (Layer 1) — anti-clobber: a municipality an officer set
    // by hand is NEVER overwritten by auto attribution, and neither is its
    // provenance ("manual" must survive). Terrain + covered-zones are
    // geometry-derived and always refresh regardless, exactly as on the patrol
    // path — the override is a claim about JURISDICTION, not about geometry.
    //
    // Without this guard the officer's correction is silently destroyed on the
    // very next ER sync, which makes the whole override feature a lie.
    //
    // The comparison is a JS strict-equality on the enum, NOT a DB `not:
    // "manual"` predicate — `NULL <> 'manual'` is NULL in SQL, so an ORM-side
    // guard would silently match nothing for the (very common) null-method row.
    // See LESSONS_GLOBAL `sql.three-valued-logic.not-predicate-skips-nulls`.
    //
    // On the auto path the method is "containment" whenever a municipality was
    // resolved, and null when the point falls outside every boundary
    // (unattributed ⇒ no method to record, never a false claim).
    const manualOverride = event.municipalityAttributionMethod === "manual";
    await platformPrisma.event.update({
      where: { id },
      data: manualOverride
        ? { terrain }
        : {
            municipalityId,
            municipalityAssignedAt: now,
            municipalityAttributionMethod: municipalityId != null ? "containment" : null,
            terrain,
          },
    });

    // Upsert junction rows (Layer 2) — idempotent
    for (const protectedZoneId of zoneIds) {
      await platformPrisma.eventCoveredZone.upsert({
        where: { eventId_protectedZoneId: { eventId: id, protectedZoneId } },
        // source: "geometry" — this processor only ever derives memberships from
        // geometry; title-derived rows (source "title_hint") come solely from the
        // one-time backfill and are never produced or pruned here.
        create: { tenantId, eventId: id, protectedZoneId, assignedAt: now, source: "geometry" },
        update: { assignedAt: now },
      });
    }

    return {
      entity,
      id,
      // Report the municipality that is actually ON the row — on an override
      // that is the officer's value, not the containment result we discarded.
      municipalityId: manualOverride ? event.municipalityId : municipalityId,
      zoneIds,
      skipped: false,
      ...(manualOverride ? { skipReason: "manual_override" } : {}),
    };
  }

  // ── Patrol path ──────────────────────────────────────────────────────────

  const patrol = await platformPrisma.patrol.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      startLocationLat: true,
      startLocationLon: true,
      municipalityId: true,
      municipalityManual: true,
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

  // Layer 1 — a patrol is counted ONLY in the municipality that CONTAINS its
  // START point (owner governing rule 2026-07-15): regardless of where the
  // track later overlaps or traverses into neighbors, jurisdiction follows the
  // origin — never the dominant-track share, never the nearest LGU. Prefer the
  // recorded start location; fall back to the track's first point; a start
  // outside every boundary stays UNATTRIBUTED (null).
  const startPoint = point ?? firstTrackPoint(trackGeojson);
  const municipalityId =
    startPoint != null
      ? assignMunicipalityByContainment(startPoint, municipalities)
      : null;

  // Layer 2 — use track if materialised, fallback to single point
  const zoneIds = trackGeojson != null
    ? assignZonesToTrack(trackGeojson, zones)
    : assignZonesToPoint(point as { lat: number; lon: number }, zones);

  // Terrain — majority vote across track points when materialised, else the
  // single start-location point.
  const terrain = trackGeojson != null
    ? await classifyTrackTerrain(trackGeojson, municipalities)
    : classifyPointTerrain(point as { lat: number; lon: number }, municipalities);

  // Update patrol row (Layer 1) — anti-clobber: a manually-overridden
  // municipalityId is never overwritten by auto attribution, and neither is its
  // municipalityAttributionMethod ("manual" must survive). Terrain +
  // covered-zones are geometry-derived and always refresh regardless.
  //
  // On the auto path the method is "containment" whenever a municipality was
  // resolved — this holds for BOTH start-point sources (the recorded
  // startLocation and the track-first-point fallback), since both feed the same
  // assignMunicipalityByContainment call. A start outside every boundary stays
  // unattributed, so the method is null rather than a false "containment" claim.
  const manualOverride = patrol.municipalityManual;
  await platformPrisma.patrol.update({
    where: { id },
    data: manualOverride
      ? { terrain }
      : {
          municipalityId,
          municipalityAssignedAt: now,
          municipalityAttributionMethod: municipalityId != null ? "containment" : null,
          terrain,
        },
  });

  // Upsert junction rows (Layer 2) — idempotent
  for (const protectedZoneId of zoneIds) {
    await platformPrisma.patrolCoveredZone.upsert({
      where: { patrolId_protectedZoneId: { patrolId: id, protectedZoneId } },
      // source: "geometry" — see the event path above; the live processor only
      // ever writes geometry-derived memberships. Title-derived "title_hint" rows
      // come solely from scripts/backfill-zone-title-hint.ts.
      create: { tenantId, patrolId: id, protectedZoneId, assignedAt: now, source: "geometry" },
      update: { assignedAt: now },
    });
  }

  return {
    entity,
    id,
    municipalityId: manualOverride ? patrol.municipalityId : municipalityId,
    zoneIds,
    skipped: false,
    ...(manualOverride ? { skipReason: "manual_override" } : {}),
  };
}
