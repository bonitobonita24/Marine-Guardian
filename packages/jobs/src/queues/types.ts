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

export type JobPayloadMap = {
  "er-sync": ErSyncJobPayload;
  alerts: AlertJobPayload;
  email: EmailJobPayload;
  maintenance: MaintenanceJobPayload;
};

export type QueueName = keyof JobPayloadMap;

export const QUEUE_NAMES = {
  ER_SYNC: "er-sync",
  ALERTS: "alerts",
  EMAIL: "email",
  MAINTENANCE: "maintenance",
} as const satisfies Record<string, QueueName>;
