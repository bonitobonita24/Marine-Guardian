import type { Job } from "bullmq";
import type { ErSyncJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import { platformPrisma, decrypt } from "@marine-guardian/db";
import { Prisma, PatrolType, PatrolState, EventState } from "@prisma/client";
import { EarthRangerClient } from "../lib/earthranger-client";
import { enqueueAlert } from "../queues/alerts.queue";
import { enqueueAreaRederive } from "../queues/area-rederive.queue";
import { enqueuePatrolTrackMaterialize } from "../queues/patrol-track-materialize.queue";
import { enqueueMunicipalityAssign } from "../queues/municipality-assign.queue";
import { resolveReportedBy } from "../lib/resolve-reported-by";
import { resolveEventType } from "../lib/resolve-event-type";

/**
 * q-ops conflict / edit-protection merge rule (M2).
 *
 * Strategy: REVISION-PRESENCE.
 * A field is considered "locally edited" when at least one EventRevision /
 * PatrolRevision row exists for that fieldName on the record. We query the
 * distinct edited field names from the revision table and omit those fields
 * from the ER sync update payload. erOriginalSnapshot is always immutable
 * (set-once on first insert, never in this path).
 *
 * Non-destructive signalling: no extra column needed. The er-sync update
 * simply skips locally-edited fields. The revision table IS the signal —
 * any field with a revision entry is protected.
 */
async function getEventEditedFields(
  tenantId: string,
  eventId: string,
): Promise<Set<string>> {
  const rows = await platformPrisma.eventRevision.findMany({
    where: { tenantId, eventId },
    select: { fieldName: true },
    distinct: ["fieldName"],
  });
  return new Set(rows.map((r) => r.fieldName));
}

async function getPatrolEditedFields(
  tenantId: string,
  patrolId: string,
): Promise<Set<string>> {
  const rows = await platformPrisma.patrolRevision.findMany({
    where: { tenantId, patrolId },
    select: { fieldName: true },
    distinct: ["fieldName"],
  });
  return new Set(rows.map((r) => r.fieldName));
}

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

  // Read the ER connection from TenantErConnection — the canonical table the
  // Settings UI writes to via settings.upsertErConnection / testConnection.
  // (The legacy Tenant.earthrangerUrl / earthrangerDasToken columns are never
  // populated by the UI, so reading them here left the worker permanently
  // "not configured" despite a saved, verified connection.)
  const conn = await platformPrisma.tenantErConnection.findUnique({
    where: { tenantId },
    select: {
      baseUrl: true,
      apiTokenEnc: true,
    },
  });

  // baseUrl + apiTokenEnc are non-nullable columns, so a missing row (conn ==
  // null) is the only "not configured" case.
  if (conn == null) {
    throw new Error("EarthRanger not configured for this tenant");
  }

  const erUrl = conn.baseUrl;
  const erToken = decrypt(conn.apiTokenEnc);
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

// A subject's ER-reported last_position/last_position_date come and go per
// sync (ER does not always echo a position on every list call). Building the
// update payload conditionally — omitting the three position fields entirely
// when ER provides no position on THIS sync — means Prisma leaves the
// existing column values untouched instead of overwriting a real, previously
// known position back to null. When ER DOES provide a position, it always
// wins (fresh position replaces whatever was there). Exported as a pure
// function so it's testable without touching Prisma/ER.
export function buildSubjectUpdatePayload(s: {
  name: string;
  subject_type?: string | null;
  subject_subtype?: string | null;
  last_position?: { latitude: number; longitude: number } | null;
  last_position_date?: string | null;
  additional?: Record<string, unknown> | unknown[] | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: s.name,
    subjectType: s.subject_type ?? null,
    subjectSubtype: s.subject_subtype ?? null,
    additionalJson: toJsonOrNull(s.additional),
  };

  if (s.last_position != null) {
    payload.lastPositionLat = s.last_position.latitude;
    payload.lastPositionLon = s.last_position.longitude;
  }

  if (s.last_position_date != null) {
    payload.lastPositionAt = new Date(s.last_position_date);
  }

  return payload;
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
        ...buildSubjectUpdatePayload(s),
        syncedAt: now,
      },
    });
  }

  return subjects.length;
}

// Skylight automated vessel-detection events (event type `display` containing
// "skylight", case-insensitive — same marker used in dashboard.ts:179 /
// reportMap.ts:59) are ingested like any other event as of SKY-1. They are
// still EXCLUDED from reports, the dashboard, the /events list, and
// municipality coverage (those exclusions are unchanged); the /map Interactive
// Report Map surfaces them only when the user opts in via the "Show Skylight
// events" toggle (apps/web map.ts `includeSkylight` input).
//
// T2 (2026-07-06): every event's `event_type` is now resolved to its
// EventType catalog row via resolveEventType() (see resolve-event-type.ts).
// Skylight/analyzer_event types (e.g. `entry_alert_rep` → "Skylight Entry
// Alert") additionally default to `state: resolved` on FIRST INSERT only —
// see the create branch below.
async function syncEvents(
  client: EarthRangerClient,
  tenantId: string,
  since?: string,
): Promise<number> {
  const events = await client.getEvents(since);
  const now = new Date();

  for (const e of events) {
    const resolved = await resolveReportedBy(platformPrisma, tenantId, e.reported_by);
    // T2 (2026-07-06): resolve ER `event_type` (e.g. "entry_alert_rep") to the
    // tenant's EventType catalog row. Previously eventTypeId was never set at
    // all here — see resolve-event-type.ts for the full root-cause writeup.
    const resolvedType = await resolveEventType(platformPrisma, tenantId, e.event_type);
    const liveFields = {
      eventTypeId: resolvedType.eventTypeId,
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
          // T2: Skylight/analyzer-derived events (e.g. entry_alert_rep AOI
          // visits) default to Resolved on FIRST INSERT only — they require
          // no ranger action. Guarded to the create branch so a manually
          // re-opened event is NEVER re-resolved by a later recurring sync
          // (the update branch below never touches `state`).
          ...(resolvedType.isSkylight ? { state: EventState.resolved } : {}),
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
      //
      // M2 edit-protection merge (q-ops conflict rule — REVISION-PRESENCE strategy):
      // Fields that have been locally edited (presence of an EventRevision row) are
      // excluded from the sync update so operator edits survive ER upstream changes.
      // The field is NOT clobbered — the revision table acts as the protection signal.
      const editedFields = await getEventEditedFields(tenantId, existing.id);
      const safeFields = Object.fromEntries(
        Object.entries(liveFields).filter(([key]) => !editedFields.has(key)),
      ) as Partial<typeof liveFields>;

      await platformPrisma.event.update({
        where: { id: existing.id },
        data: safeFields,
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
    try {
      await enqueueMunicipalityAssign({
        tenantId,
        userId: "system",
        entity: "event",
        id: eventId,
      });
    } catch (err) {
      console.error(
        `[er-sync] enqueueMunicipalityAssign failed for event ${eventId}:`,
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
    // Map EarthRanger patrol_type to MG enum. ER uses values like "marine",
    // "sea_patrol", "boat", "water_patrol", etc. — never the bare string
    // "seaborne". Use the same keyword heuristic as ingest-earthranger.mjs
    // (mapPatrolType) so live synced patrols are classified correctly.
    const patrolTypeRaw = (p.patrol_type ?? "").toLowerCase();
    const patrolType: PatrolType =
      patrolTypeRaw.includes("sea") ||
      patrolTypeRaw.includes("boat") ||
      patrolTypeRaw.includes("marine") ||
      patrolTypeRaw.includes("water")
        ? PatrolType.seaborne
        : PatrolType.foot;
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

    // Check for locally-edited patrol fields BEFORE the upsert so we can
    // protect them in the update path (q-ops conflict rule — REVISION-PRESENCE).
    // On create (new patrol) there are no revisions yet — no protection needed.
    const existingPatrol = await platformPrisma.patrol.findUnique({
      where: { tenantId_erPatrolId: { tenantId, erPatrolId: p.id } },
      select: { id: true },
    });

    const editedPatrolFields =
      existingPatrol !== null
        ? await getPatrolEditedFields(tenantId, existingPatrol.id)
        : new Set<string>();
    const safeLivePatrolFields = Object.fromEntries(
      Object.entries(livePatrolFields).filter(([key]) => !editedPatrolFields.has(key)),
    ) as Partial<typeof livePatrolFields>;

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
        // Locally-edited fields (per PatrolRevision rows) are excluded from safeLivePatrolFields.
        lastSyncedAt: now,
        syncNeeded: false,
        ...safeLivePatrolFields,
      },
      select: { id: true },
    });

    // event-patrol-link — derive Event.patrolId from the patrol side (ER's
    // event→patrol back-reference is unreliable; patrol.patrol_segments[].events[]
    // is the only trustworthy source). This must run AFTER the patrol upsert so
    // `patrol.id` exists. If the corresponding Event rows haven't synced yet,
    // updateMany matches zero rows here and self-heals on the NEXT patrol sync
    // pass (or via the offline backfill script) once syncEvents() has run.
    const erEventIds = Array.from(
      new Set(segments.flatMap((s) => (s.events ?? []).map((e) => e.id))),
    );
    if (erEventIds.length > 0) {
      await platformPrisma.event.updateMany({
        where: { tenantId, erEventId: { in: erEventIds } },
        data: { patrolId: patrol.id },
      });
    }

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
    // Municipality assignment deferred — needs PatrolTrack (startLocationLat/Lon
    // may already be set from segment coords; the processor handles null gracefully).
    try {
      await enqueueMunicipalityAssign({
        tenantId,
        userId: "system",
        entity: "patrol",
        id: patrol.id,
      });
    } catch (err) {
      console.error(
        `[er-sync] enqueueMunicipalityAssign failed for patrol ${patrol.id}:`,
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
