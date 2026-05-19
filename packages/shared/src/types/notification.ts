import type { NotificationType } from "./enums";

// Notification — Command Center alert envelope.
// Per-user read state lives on NotificationRecipient (one Notification, N recipients).
// v2 spec: docs/v2/PRODUCT.md L480-484.
export interface Notification {
  id: string;
  tenantId: string;
  alertRuleId: string | null;
  eventId: string | null;
  patrolId: string | null;
  subjectId: string | null;
  title: string;
  message: string;
  notificationType: NotificationType;
  createdAt: Date;
}

export type NotificationEmailStatus =
  | "pending"
  | "sent"
  | "suppressed_by_cooldown"
  | "digested"
  | "failed";

export interface NotificationRecipient {
  id: string;
  notificationId: string;
  userId: string;
  isRead: boolean;
  readAt: Date | null;
  emailSentAt: Date | null;
  emailStatus: NotificationEmailStatus;
  createdAt: Date;
}
