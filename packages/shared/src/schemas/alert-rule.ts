import { z } from "zod";
import { eventPrioritySchema, notificationChannelSchema } from "./enums";

export const alertRuleConditionSchema = z.object({
  eventType: z.string().max(255).nullable(),
  priorityThreshold: eventPrioritySchema.nullable(),
  category: z.string().max(255).nullable(),
});

export const alertRuleSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  name: z.string().min(1).max(255),
  condition: alertRuleConditionSchema,
  notificationChannels: z.array(notificationChannelSchema),
  isActive: z.boolean().default(true),
  createdById: z.string().cuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createAlertRuleSchema = alertRuleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAlertRuleSchema = createAlertRuleSchema.partial().omit({
  tenantId: true,
  createdById: true,
});
