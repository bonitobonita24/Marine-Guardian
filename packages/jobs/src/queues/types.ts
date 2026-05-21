export interface BaseJobPayload {
  tenantId: string;
  userId: string;
}

export interface ErSyncJobPayload extends BaseJobPayload {
  syncType: "events" | "subjects" | "patrols" | "observations" | "event_types";
  since?: string;
}

export interface AlertJobPayload extends BaseJobPayload {
  alertRuleId: string;
  eventId: string;
  priority: number;
}

export interface EmailJobPayload extends BaseJobPayload {
  to: string;
  subject: string;
  templateId: string;
  templateData: Record<string, string>;
}

export interface MaintenanceJobPayload extends BaseJobPayload {
  task:
    | "cleanup_old_sync_logs"
    | "refresh_materialized_views"
    | "archive_resolved_events";
}

/**
 * 5.1c — Area re-derive job payload. Enqueued when:
 *  - 5.1d sync engine ingests an Event/Patrol upsert with a changed areaName,
 *  - 5.1d AreaBoundary CUD mutation (create/update/delete/enable/disable)
 *    triggers a batch re-derive across affected rows,
 *  - 5.1e admin clicks the manual "Rebuild area derivation" button.
 *
 * tenantId is included for observability/logging even though
 * applyAreaDerivation re-derives it from the row itself.
 * userId is set to the triggering user when known (admin rebuild path)
 * or to a sync-system sentinel for automatic enqueues — required by
 * BaseJobPayload + validateTenantContext.
 */
export interface AreaRederiveJobPayload extends BaseJobPayload {
  entity: "event" | "patrol" | "fuelEntry";
  id: string;
}

/**
 * 5.2b — Patrol track materialize job payload. Enqueued when:
 *  - 5.2c admin clicks the manual "Rebuild patrol tracks" button
 *    (tenant-wide fan-out: one job per active Patrol in the tenant),
 *  - (DEFERRED) er-sync.processor inline enqueue after each successful patrol
 *    upsert in syncPatrols — parked behind the same precondition as
 *    5.1d Area A (no test coverage on er-sync.processor.ts yet).
 *
 * tenantId is included for observability/logging + dedupe jobId scoping
 * even though materializePatrolTrack derives the tenant from the patrol
 * row itself and loads tenant credentials via decrypt() internally.
 * userId is set to the triggering user when known (admin rebuild path)
 * or to a sync-system sentinel for automatic enqueues — required by
 * BaseJobPayload + validateTenantContext.
 */
export interface PatrolTrackMaterializeJobPayload extends BaseJobPayload {
  patrolId: string;
}

/**
 * 5.3b — PDF render job payload. Enqueued when:
 *  - reportExport.create mutation completes the row insert (status=queued)
 *    and fires the producer side of the pdf-render pipeline,
 *  - 5.3d admin "Retry" button on a failed export row re-enqueues with
 *    the same exportId (jobId dedupe collapses double-clicks to one job).
 *
 * jobId pattern: `pdf-render:${exportId}` — NOT scoped by tenantId.
 * exportId is the ReportExport.id PK (cuid, globally unique across all
 * tenants), so tenant scoping would be redundant. exportId is the row
 * identity that owns this render — re-enqueueing the same exportId
 * (e.g. retry button while still queued/rendering) collapses to one
 * BullMQ job via the deterministic jobId.
 *
 * tenantId is included for observability/logging + validateTenantContext
 * (required by BaseJobPayload). The processor re-loads the ReportExport
 * row and uses row.tenantId as the source of truth for tenant scoping
 * downstream (printUrl construction + storage path + audit).
 * userId is set to the triggering user (req.session.userId for admin
 * create or admin retry) — required by BaseJobPayload.
 */
export interface PdfRenderJobPayload extends BaseJobPayload {
  exportId: string;
}

export type JobPayloadMap = {
  "er-sync": ErSyncJobPayload;
  alerts: AlertJobPayload;
  email: EmailJobPayload;
  maintenance: MaintenanceJobPayload;
  "area-rederive": AreaRederiveJobPayload;
  "patrol-track-materialize": PatrolTrackMaterializeJobPayload;
  "pdf-render": PdfRenderJobPayload;
};

export type QueueName = keyof JobPayloadMap;

export const QUEUE_NAMES = {
  ER_SYNC: "er-sync",
  ALERTS: "alerts",
  EMAIL: "email",
  MAINTENANCE: "maintenance",
  AREA_REDERIVE: "area-rederive",
  PATROL_TRACK_MATERIALIZE: "patrol-track-materialize",
  PDF_RENDER: "pdf-render",
} as const satisfies Record<string, QueueName>;
