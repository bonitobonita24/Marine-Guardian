import { z } from "zod";
import { notificationChannelSchema } from "./enums";

/**
 * Canonical alert-rule condition schema.
 *
 * All three layers — UI create form, seed data, and the alert evaluator —
 * must agree on this shape. See DECISIONS_LOG.md entry 2026-06-24.
 *
 * Fields (all optional — a rule with no fields matches every event):
 *   minPriority  — fire when event.priority >= this value.
 *                  Uses the 0/100/200/300 scale (LOW/MEDIUM/HIGH/CRITICAL).
 *   eventTypeId  — fire only when event.eventTypeId matches exactly.
 *                  This is the Prisma string ID, not the human-readable code.
 */
export const alertRuleConditionSchema = z.object({
  minPriority: z.number().int().min(0).max(300).optional(),
  eventTypeId: z.string().max(255).optional(),
}).strict(); // Reject unknown fields so stale { severity } conditions fail loudly rather than silently becoming catch-alls.

export type AlertRuleCondition = z.infer<typeof alertRuleConditionSchema>;

export const alertRuleSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  name: z.string().min(1).max(255),
  conditionJson: alertRuleConditionSchema,
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
