import type { NotificationChannel } from "./enums";

/**
 * Canonical alert-rule condition shape.
 *
 * All optional. A rule with no fields set is a catch-all (matches every event).
 *   minPriority  — fire when event.priority >= minPriority (0/100/200/300 scale).
 *   eventTypeId  — fire only when event.eventTypeId matches exactly (Prisma ID).
 */
export interface AlertRuleCondition {
  minPriority?: number;
  eventTypeId?: string;
}

export interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  conditionJson: AlertRuleCondition;
  notificationChannels: NotificationChannel[];
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
