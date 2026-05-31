import type { Job } from "bullmq";
import type { ErSyncJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import { platformPrisma, decrypt } from "@marine-guardian/db";
import { Prisma } from "@prisma/client";
import { EarthRangerClient } from "../lib/earthranger-client";
import { enqueueAlert } from "../queues/alerts.queue";
import { enqueueAreaRederive } from "../queues/area-rederive.queue";

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
    const data = {
      serialNumber: e.serial_number != null ? String(e.serial_number) : null,
      title: e.title ?? null,
      priority: e.priority ?? 0,
      reportedByName: e.reported_by?.name ?? null,
      reportedAt: e.time != null ? new Date(e.time) : null,
      locationLat: e.location?.latitude ?? null,
      locationLon: e.location?.longitude ?? null,
      eventDetailsJson: toJsonOrNull(e.event_details),
      notesJson: toJsonOrNull(e.notes),
      syncedAt: now,
    };

    const existing = await platformPrisma.event.findUnique({
      where: { tenantId_erEventId: { tenantId, erEventId: e.id } },
      select: { id: true },
    });

    let eventId: string;
    if (existing === null) {
      const created = await platformPrisma.event.create({
        data: { tenantId, erEventId: e.id, ...data },
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
      await platformPrisma.event.update({
        where: { id: existing.id },
        data,
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

async function syncPatrols(
  client: EarthRangerClient,
  tenantId: string,
  since?: string,
): Promise<number> {
  const patrols = await client.getPatrols(since);
  const now = new Date();

  for (const p of patrols) {
    const patrolType =
      p.patrol_type === "seaborne" ? "seaborne" : "foot";
    const patrolState =
      p.state === "done"
        ? "done"
        : p.state === "cancelled"
          ? "cancelled"
          : "open";

    const patrol = await platformPrisma.patrol.upsert({
      where: {
        tenantId_erPatrolId: { tenantId, erPatrolId: p.id },
      },
      create: {
        tenantId,
        erPatrolId: p.id,
        serialNumber: p.serial_number != null ? String(p.serial_number) : null,
        title: p.title ?? null,
        patrolType,
        state: patrolState,
        startTime: p.start_time != null ? new Date(p.start_time) : null,
        endTime: p.end_time != null ? new Date(p.end_time) : null,
        syncedAt: now,
      },
      update: {
        serialNumber: p.serial_number != null ? String(p.serial_number) : null,
        title: p.title ?? null,
        patrolType,
        state: patrolState,
        startTime: p.start_time != null ? new Date(p.start_time) : null,
        endTime: p.end_time != null ? new Date(p.end_time) : null,
        syncedAt: now,
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
