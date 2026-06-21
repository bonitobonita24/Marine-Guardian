import type { Job } from "bullmq";
import type { ErSyncJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import { platformPrisma, decrypt } from "@marine-guardian/db";
import { Prisma, PatrolType, PatrolState } from "@prisma/client";
import { EarthRangerClient } from "../lib/earthranger-client";
import { enqueueAlert } from "../queues/alerts.queue";
import { enqueueAreaRederive } from "../queues/area-rederive.queue";
import { enqueuePatrolTrackMaterialize } from "../queues/patrol-track-materialize.queue";
import { resolveReportedBy } from "../lib/resolve-reported-by";

function toJsonOrNull(
  value: Record<string, unknown> | unknown[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function processErSync(
  job: Job<ErSyncJobPayload>,
): Promise<void> {
  validateTenantContext(job.data);

  const { syncType, since, tenantId } = job.data;

  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      earthrangerUrl: true,
      earthrangerDasToken: true,
    },
  });

  if (tenant?.earthrangerUrl == null || tenant.earthrangerDasToken == null) {
    throw new Error("EarthRanger not configured for this tenant");
  }

  const erUrl = decrypt(tenant.earthrangerUrl);
  const erToken = decrypt(tenant.earthrangerDasToken);
  const client = new EarthRangerClient(erUrl, erToken);

  const syncLog = await platformPrisma.syncLog.create({
    data: {
      tenantId,
      syncType,
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    let recordsSynced = 0;

    switch (syncType) {
      case "event_types":
        recordsSynced = await syncEventTypes(client, tenantId);
        break;
      case "subjects":
        recordsSynced = await syncSubjects(client, tenantId);
        break;
      case "events":
        recordsSynced = await syncEvents(client, tenantId, since);
        break;
      case "patrols":
        recordsSynced = await syncPatrols(client, tenantId, since);
        break;
      case "observations":
        recordsSynced = await syncObservations(client, tenantId, since);
        break;
    }

    await platformPrisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        recordsSynced,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await platformPrisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function syncEventTypes(
  client: EarthRangerClient,
  tenantId: string,
): Promise<number> {
  const types = await client.getEventTypes();
  const now = new Date();

  for (const t of types) {
    await platformPrisma.eventType.upsert({
      where: {
        tenantId_erEventtypeId: { tenantId, erEventtypeId: t.id },
      },
      create: {
        tenantId,
        erEventtypeId: t.id,
        value: t.value,
        display: t.display,
        category: t.category?.value ?? null,
        defaultPriority: t.default_priority ?? 0,
        iconId: t.icon_id ?? null,
        schemaJson: toJsonOrNull(t.schema as Record<string, unknown> | null | undefined),
        syncedAt: now,
      },
      update: {
        value: t.value,
        display: t.display,
        category: t.category?.value ?? null,
        defaultPriority: t.default_priority ?? 0,
        iconId: t.icon_id ?? null,
        schemaJson: toJsonOrNull(t.schema as Record<string, unknown> | null | undefined),
        syncedAt: now,
      },
    });
  }

  return types.length;
}

async function syncSubjects(
  client: EarthRangerClient,
  tenantId: string,
): Promise<number> {
  const subjects = await client.getSubjects();
  const now = new Date();

  for (const s of subjects) {
    await platformPrisma.subject.upsert({
      where: {
        tenantId_erSubjectId: { tenantId, erSubjectId: s.id },
      },
      create: {
        tenantId,
        erSubjectId: s.id,
        name: s.name,
        subjectType: s.subject_type ?? null,
        subjectSubtype: s.subject_subtype ?? null,
        lastPositionLat: s.last_position?.latitude ?? null,
        lastPositionLon: s.last_position?.longitude ?? null,
        lastPositionAt: s.last_position_date != null
          ? new Date(s.last_position_date)
          : null,
        additionalJson: toJsonOrNull(s.additional as Record<string, unknown> | null | undefined),
        syncedAt: now,
      },
      update: {
        name: s.name,
        subjectType: s.subject_type ?? null,
        subjectSubtype: s.subject_subtype ?? null,
        lastPositionLat: s.last_position?.latitude ?? null,
        lastPositionLon: s.last_position?.longitude ?? null,
        lastPositionAt: s.last_position_date != null
          ? new Date(s.last_position_date)
          : null,
        additionalJson: toJsonOrNull(s.additional as Record<string, unknown> | null | undefined),
        syncedAt: now,
      },
    });
  }

  return subjects.length;
}

async function syncEvents(
  client: EarthRangerClient,
  tenantId: string,
  since?: string,
): Promise<number> {
  const events = await client.getEvents(since);
  const now = new Date();

  for (const e of events) {
    const resolved = await resolveReportedBy(platformPrisma, tenantId, e.reported_by);
    const liveFields = {
      serialNumber: e.serial_number != null ? String(e.serial_number) : null,
      title: e.title ?? null,
      priority: e.priority ?? 0,
      reportedByName: e.reported_by?.name ?? null,
      reportedByUserId: resolved.reportedByUserId,
      reportedByKnownRangerId: resolved.reportedByKnownRangerId,
      reportedAt: e.time != null ? new Date(e.time) : null,
      locationLat: e.location?.latitude ?? null,
      locationLon: e.location?.longitude ?? null,
      eventDetailsJson: toJsonOrNull(e.event_details),
      notesJson: toJsonOrNull(e.notes),
      endTime: e.end_time != null ? new Date(e.end_time) : null,
      hasPhoto: Array.isArray(e.photos) && e.photos.length > 0,
      syncedAt: now,
    };

    const existing = await platformPrisma.event.findUnique({
      where: { tenantId_erEventId: { tenantId, erEventId: e.id } },
      select: { id: true, erOriginalSnapshot: true },
    });

    let eventId: string;
    if (existing === null) {
      // First insert: set erOriginalSnapshot from verbatim ER payload.
      // This field is immutable — it is NEVER overwritten in subsequent syncs (q-ops-03).
      const snapshotJson = toJsonOrNull(e as unknown as Record<string, unknown>);
      const created = await platformPrisma.event.create({
        data: {
          tenantId,
          erEventId: e.id,
          erOriginalSnapshot: snapshotJson,
          ...liveFields,
        },
        select: { id: true, priority: true },
      });
      eventId = created.id;
      try {
        await enqueueAlert({
          tenantId,
          userId: "system",
          alertRuleId: "",
          eventId: created.id,
          priority: created.priority,
        });
      } catch (err) {
        console.error(
          `[er-sync] enqueueAlert failed for event ${created.id}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      // Subsequent sync: update live fields ONLY.
      // erOriginalSnapshot is intentionally excluded from the update (q-ops-03).
      // M2 edit-protection merge: when locally-edited fields exist, they will be
      // excluded from `liveFields` here — forward-compatible by design.
      await platformPrisma.event.update({
        where: { id: existing.id },
        data: liveFields,
      });
      eventId = existing.id;
    }

    try {
      await enqueueAreaRederive({
        tenantId,
        userId: "system",
        entity: "event",
        id: eventId,
      });
    } catch (err) {
      console.error(
        `[er-sync] enqueueAreaRederive failed for event ${eventId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return events.length;
}

/**
 * Sync patrols from EarthRanger into the canonical Patrol table.
 *
 * `syncNeeded` semantics:
 *   - `false` = canonical patrol state is synced (the upsert itself IS the resync).
 *   - `true`  = the upsert succeeded but a downstream materialization step
 *               (area re-derive or patrol-track materialize) failed to enqueue,
 *               so the row still needs a re-sync pass.
 * Queryable via the (tenantId, syncNeeded, lastSyncedAt) index.
 */
async function syncPatrols(
  client: EarthRangerClient,
  tenantId: string,
  since?: string,
): Promise<number> {
  const patrols = await client.getPatrols(since);
  const now = new Date();

  for (const p of patrols) {
    const patrolType: PatrolType =
      p.patrol_type === "seaborne" ? PatrolType.seaborne : PatrolType.foot;
    const patrolState: PatrolState =
      p.state === "done"
        ? PatrolState.done
        : p.state === "cancelled"
          ? PatrolState.cancelled
          : PatrolState.open;

    const isTestPatrol = /test|qa|demo/i.test(p.title ?? "");
    const segments = p.patrol_segments ?? [];
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];
    // GeoJSON Point coordinates = [lon, lat]
    const startLon = firstSeg?.start_location?.coordinates?.[0] ?? null;
    const startLat = firstSeg?.start_location?.coordinates?.[1] ?? null;
    const endLon = lastSeg?.end_location?.coordinates?.[0] ?? null;
    const endLat = lastSeg?.end_location?.coordinates?.[1] ?? null;

    const livePatrolFields = {
      serialNumber: p.serial_number != null ? String(p.serial_number) : null,
      title: p.title ?? null,
      patrolType,
      state: patrolState,
      startTime: p.start_time != null ? new Date(p.start_time) : null,
      endTime: p.end_time != null ? new Date(p.end_time) : null,
      syncedAt: now,
      startLocationLat: startLat,
      startLocationLon: startLon,
      endLocationLat: endLat,
      endLocationLon: endLon,
      isTestPatrol,
    };

    const patrol = await platformPrisma.patrol.upsert({
      where: {
        tenantId_erPatrolId: { tenantId, erPatrolId: p.id },
      },
      create: {
        tenantId,
        erPatrolId: p.id,
        // First insert: capture verbatim ER payload as immutable snapshot (q-ops-03).
        // NEVER overwritten in subsequent syncs.
        erOriginalSnapshot: toJsonOrNull(p as unknown as Record<string, unknown>),
        firstSeenAt: now,
        lastSyncedAt: now,
        syncNeeded: false,
        ...livePatrolFields,
      },
      update: {
        // Subsequent sync: update live fields ONLY.
        // erOriginalSnapshot intentionally excluded (q-ops-03).
        // M2 edit-protection merge: locally-edited fields will be excluded here.
        lastSyncedAt: now,
        syncNeeded: false,
        ...livePatrolFields,
      },
      select: { id: true },
    });

    try {
      await enqueueAreaRederive({
        tenantId,
        userId: "system",
        entity: "patrol",
        id: patrol.id,
      });
    } catch (err) {
      console.error(
        `[er-sync] enqueueAreaRederive failed for patrol ${patrol.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      // Upsert succeeded but downstream materialization failed — flag for re-sync.
      await platformPrisma.patrol.update({
        where: { id: patrol.id },
        data: { syncNeeded: true },
      });
    }
    try {
      await enqueuePatrolTrackMaterialize({
        tenantId,
        userId: "system",
        patrolId: patrol.id,
      });
    } catch (err) {
      console.error(
        `[er-sync] enqueuePatrolTrackMaterialize failed for patrol ${patrol.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      // Upsert succeeded but downstream materialization failed — flag for re-sync.
      await platformPrisma.patrol.update({
        where: { id: patrol.id },
        data: { syncNeeded: true },
      });
    }
  }

  return patrols.length;
}

async function syncObservations(
  client: EarthRangerClient,
  tenantId: string,
  since?: string,
): Promise<number> {
  const observations = await client.getObservations(since);
  const now = new Date();

  for (const o of observations) {
    await platformPrisma.observation.upsert({
      where: {
        tenantId_erObservationId: { tenantId, erObservationId: o.id },
      },
      create: {
        tenantId,
        erObservationId: o.id,
        locationLat: o.location?.latitude ?? 0,
        locationLon: o.location?.longitude ?? 0,
        recordedAt: o.recorded_at != null ? new Date(o.recorded_at) : now,
        sourceName: o.source ?? null,
        additionalJson: toJsonOrNull(o.additional as Record<string, unknown> | null | undefined),
        syncedAt: now,
      },
      update: {
        locationLat: o.location?.latitude ?? 0,
        locationLon: o.location?.longitude ?? 0,
        recordedAt: o.recorded_at != null ? new Date(o.recorded_at) : now,
        sourceName: o.source ?? null,
        additionalJson: toJsonOrNull(o.additional as Record<string, unknown> | null | undefined),
        syncedAt: now,
      },
    });
  }

  return observations.length;
}
