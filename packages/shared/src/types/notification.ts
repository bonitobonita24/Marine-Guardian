import type { NotificationType } from "./enums";

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  alertRuleId: string | null;
  eventId: string | null;
  patrolId: string | null;
  title: string;
  message: string;
  isRead: boolean;
  notificationType: NotificationType;
  createdAt: Date;
}
