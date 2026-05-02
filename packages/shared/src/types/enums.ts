export const UserRole = {
  SUPER_ADMIN: "super_admin",
  SITE_ADMIN: "site_admin",
  FIELD_COORDINATOR: "field_coordinator",
  OPERATOR: "operator",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Language = {
  EN: "en",
  ID: "id",
  MS: "ms",
} as const;
export type Language = (typeof Language)[keyof typeof Language];

export const PatrolType = {
  FOOT: "foot",
  SEABOURN: "seabourn",
} as const;
export type PatrolType = (typeof PatrolType)[keyof typeof PatrolType];

export const PatrolState = {
  OPEN: "open",
  DONE: "done",
  CANCELLED: "cancelled",
} as const;
export type PatrolState = (typeof PatrolState)[keyof typeof PatrolState];

export const EventState = {
  NEW: "new",
  ACTIVE: "active",
  RESOLVED: "resolved",
} as const;
export type EventState = (typeof EventState)[keyof typeof EventState];

export const EventPriority = {
  LOW: 0,
  MEDIUM: 100,
  HIGH: 200,
  CRITICAL: 300,
} as const;
export type EventPriority = (typeof EventPriority)[keyof typeof EventPriority];

export const SyncType = {
  EVENTS: "events",
  SUBJECTS: "subjects",
  PATROLS: "patrols",
  OBSERVATIONS: "observations",
  EVENT_TYPES: "event_types",
} as const;
export type SyncType = (typeof SyncType)[keyof typeof SyncType];

export const SyncStatus = {
  SUCCESS: "success",
  FAILED: "failed",
  PARTIAL: "partial",
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const NotificationType = {
  CRITICAL: "critical",
  WARNING: "warning",
  INFO: "info",
  SYSTEM: "system",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const RangerType = {
  REGISTERED: "registered",
  FREETEXT: "freetext",
} as const;
export type RangerType = (typeof RangerType)[keyof typeof RangerType];

export const AccompanyingEntityType = {
  EVENT: "event",
  PATROL: "patrol",
} as const;
export type AccompanyingEntityType =
  (typeof AccompanyingEntityType)[keyof typeof AccompanyingEntityType];

export const KnownRangerSource = {
  EARTHRANGER_SYNC: "earthranger_sync",
  MANUAL_ENTRY: "manual_entry",
} as const;
export type KnownRangerSource =
  (typeof KnownRangerSource)[keyof typeof KnownRangerSource];

export const NotificationChannel = {
  IN_APP: "in_app",
  EMAIL: "email",
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];
