import type { NotificationChannel } from "./enums";

export interface AlertRuleCondition {
  eventType: string | null;
  priorityThreshold: number | null;
  category: string | null;
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
