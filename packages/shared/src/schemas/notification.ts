import { z } from "zod";
import {
  notificationTypeSchema,
  notificationChannelSchema,
  notificationEmailStatusSchema,
} from "./enums";

// Notification — Command Center alert envelope. Per-user state lives on NotificationRecipient.
// v2 spec: docs/v2/PRODUCT.md L480-484.
export const notificationSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  alertRuleId: z.string().cuid().nullable(),
  eventId: z.string().cuid().nullable(),
  patrolId: z.string().cuid().nullable(),
  subjectId: z.string().cuid().nullable(),
  notificationType: notificationTypeSchema,
  channel: notificationChannelSchema,
  title: z.string().min(1).max(255),
  body: z.string().max(2000),
  createdAt: z.coerce.date(),
});

// NotificationRecipient — per-user read state + email-dispatch tracking for ONE Notification.
// One Notification row, N NotificationRecipient rows (one per recipient user).
export const notificationRecipientSchema = z.object({
  id: z.string().cuid(),
  notificationId: z.string().cuid(),
  userId: z.string().cuid(),
  isRead: z.boolean().default(false),
  readAt: z.coerce.date().nullable(),
  emailSentAt: z.coerce.date().nullable(),
  emailStatus: notificationEmailStatusSchema,
  createdAt: z.coerce.date(),
});
