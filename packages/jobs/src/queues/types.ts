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

export type JobPayloadMap = {
  "er-sync": ErSyncJobPayload;
  alerts: AlertJobPayload;
  email: EmailJobPayload;
  maintenance: MaintenanceJobPayload;
  "area-rederive": AreaRederiveJobPayload;
};

export type QueueName = keyof JobPayloadMap;

export const QUEUE_NAMES = {
  ER_SYNC: "er-sync",
  ALERTS: "alerts",
  EMAIL: "email",
  MAINTENANCE: "maintenance",
  AREA_REDERIVE: "area-rederive",
} as const satisfies Record<string, QueueName>;
