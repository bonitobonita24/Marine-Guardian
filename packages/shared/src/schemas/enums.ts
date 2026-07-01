import { z } from "zod";

export const userRoleSchema = z.enum([
  "super_admin",
  "site_admin",
  "field_coordinator",
  "operator",
]);

export const languageSchema = z.enum(["en", "id", "ms"]);

export const patrolTypeSchema = z.enum(["foot", "seaborne"]);

export const patrolStateSchema = z.enum(["open", "done", "cancelled"]);

export const eventStateSchema = z.enum(["new", "active", "resolved"]);

export const eventPrioritySchema = z.union([
  z.literal(0),
  z.literal(100),
  z.literal(200),
  z.literal(300),
]);

export const syncTypeSchema = z.enum([
  "events",
  "subjects",
  "patrols",
  "observations",
  "event_types",
]);

export const syncStatusSchema = z.enum(["success", "failed", "partial"]);

export const notificationTypeSchema = z.enum([
  "critical",
  "warning",
  "info",
  "system",
]);

export const notificationChannelSchema = z.enum(["in_app", "email"]);

export const notificationEmailStatusSchema = z.enum([
  "pending",
  "sent",
  "suppressed_by_cooldown",
  "digested",
  "failed",
]);

export const rangerTypeSchema = z.enum(["registered", "freetext"]);

export const accompanyingEntityTypeSchema = z.enum(["event", "patrol"]);

export const knownRangerSourceSchema = z.enum([
  "earthranger_sync",
  "manual_entry",
]);

export const boundarySourceSchema = z.enum(["official", "custom"]);

export const geometryTypeSchema = z.enum(["Polygon", "LineString"]);

export const trackSourceSchema = z.enum(["er_api", "cache"]);

export const reportTypeSchema = z.enum([
  "coverage",
  "area",
  "consolidated",
  "detailed",
  "rangers",
  "patrol_filtered",
  "report_map",
]);

export const paperSizeSchema = z.enum(["A4", "Letter", "Legal"]);

export const reportExportStatusSchema = z.enum([
  "queued",
  "rendering",
  "ready",
  "failed",
]);

export const reportLayoutSchema = z.enum([
  "landscape-one-per-page",
  "portrait-one-per-page",
  "continuous",
]);
