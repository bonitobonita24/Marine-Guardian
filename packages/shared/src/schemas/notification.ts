import { z } from "zod";
import { notificationTypeSchema, notificationChannelSchema } from "./enums";

export const notificationSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  userId: z.string().cuid(),
  alertRuleId: z.string().cuid().nullable(),
  notificationType: notificationTypeSchema,
  channel: notificationChannelSchema,
  title: z.string().min(1).max(255),
  body: z.string().max(2000),
  isRead: z.boolean().default(false),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
