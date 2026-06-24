import type { Job } from "bullmq";
import { platformPrisma } from "@marine-guardian/db";
import type { AlertRuleCondition } from "@marine-guardian/shared/types";
import type { AlertJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import {
  getDefaultPublisher,
  notificationChannel,
} from "../lib/realtime-publisher";

// Re-export the canonical condition type so callers don't need two imports.
type ConditionJson = AlertRuleCondition;

interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  conditionJson: ConditionJson;
  isActive: boolean;
  notificationChannels: string[];
}

interface Event {
  id: string;
  tenantId: string;
  eventTypeId: string;
  priority: number;
  state: string;
  title: string;
}

interface Recipient {
  id: string;
  tenantId: string;
  role: string;
}

function ruleMatches(rule: AlertRule, event: Event): boolean {
  const { conditionJson } = rule;

  if (
    conditionJson.eventTypeId !== undefined &&
    conditionJson.eventTypeId !== event.eventTypeId
  ) {
    return false;
  }

  if (
    conditionJson.minPriority !== undefined &&
    event.priority < conditionJson.minPriority
  ) {
    return false;
  }

  return true;
}

export interface AlertEvaluationResult {
  rulesEvaluated: number;
  rulesMatched: number;
  notificationsCreated: number;
}

export async function evaluateAlerts(
  job: Job<AlertJobPayload>,
): Promise<AlertEvaluationResult> {
  validateTenantContext(job.data);

  const { tenantId, eventId } = job.data;

  const event = (await platformPrisma.event.findFirst({
    where: { id: eventId, tenantId },
  })) as Event | null;

  if (event === null) {
    return { rulesEvaluated: 0, rulesMatched: 0, notificationsCreated: 0 };
  }

  const rules = (await platformPrisma.alertRule.findMany({
    where: { tenantId, isActive: true },
  })) as AlertRule[];

  const rulesEvaluated = rules.length;

  if (rulesEvaluated === 0) {
    return { rulesEvaluated: 0, rulesMatched: 0, notificationsCreated: 0 };
  }

  const matchingRules = rules.filter((rule) => ruleMatches(rule, event));
  const rulesMatched = matchingRules.length;

  if (rulesMatched === 0) {
    return { rulesEvaluated, rulesMatched: 0, notificationsCreated: 0 };
  }

  let notificationsCreated = 0;

  // Notifications to publish AFTER successful $transaction commit. Pub/sub is
  // best-effort delivery — the DB row is the durable source of truth, clients
  // reconcile missed events via Last-Event-ID replay on SSE reconnect (SSE-2).
  interface PendingPublish {
    userId: string;
    title: string;
    message: string;
    notificationType: string;
  }
  const pendingPublishes: PendingPublish[] = [];

  for (const rule of matchingRules) {
    const recipients = (await platformPrisma.user.findMany({
      where: { tenantId, role: { in: ["site_admin", "super_admin"] } },
    })) as Recipient[];

    if (recipients.length === 0) {
      continue;
    }

    const message = `Event "${event.title}" triggered alert rule "${rule.name}"`;
    const notificationType = "warning";

    await platformPrisma.$transaction(async (tx) => {
      const typedTx = tx as unknown as {
        notification: { create: (args: Record<string, unknown>) => Promise<unknown> };
        auditLog: { create: (args: Record<string, unknown>) => Promise<unknown> };
        alertHistory: { create: (args: Record<string, unknown>) => Promise<unknown> };
      };

      for (const recipient of recipients) {
        // The Notification model has no userId/isRead columns — per-user delivery
        // state lives on the NotificationRecipient join table (schema.prisma:
        // Notification.recipients NotificationRecipient[]). Create the per-user
        // recipient row via the nested relation write rather than as top-level
        // Notification fields (which threw Prisma "Unknown argument userId").
        await typedTx.notification.create({
          data: {
            tenantId,
            alertRuleId: rule.id,
            eventId: event.id,
            title: rule.name,
            message,
            notificationType,
            recipients: {
              create: {
                userId: recipient.id,
                isRead: false,
              },
            },
          },
        });

        await typedTx.auditLog.create({
          data: {
            action: "ALERT_FIRED",
            entityType: "Notification",
            tenantId,
            userId: recipient.id,
            entityId: event.id,
          },
        });

        notificationsCreated += 1;
        pendingPublishes.push({
          userId: recipient.id,
          title: rule.name,
          message,
          notificationType,
        });
      }

      await typedTx.alertHistory.create({
        data: {
          tenantId,
          alertRuleId: rule.id,
          eventId: event.id,
          matchedPriority: event.priority,
          recipientCount: recipients.length,
          ruleNameSnapshot: rule.name,
          eventTitleSnapshot: event.title,
        },
      });
    });

    // Publish AFTER the $transaction commits. A publisher failure here does
    // not roll back the DB write — the notification row is already durable.
    const publisher = getDefaultPublisher();
    for (const p of pendingPublishes) {
      try {
        await publisher.publish(notificationChannel(tenantId, p.userId), {
          type: "notification.created",
          tenantId,
          userId: p.userId,
          alertRuleId: rule.id,
          eventId: event.id,
          title: p.title,
          message: p.message,
          notificationType: p.notificationType,
        });
      } catch {
        // Best-effort delivery. Clients reconcile via Last-Event-ID on reconnect.
      }
    }
    pendingPublishes.length = 0;
  }

  return { rulesEvaluated, rulesMatched, notificationsCreated };
}

/** @deprecated use evaluateAlerts — kept for start-workers.ts compatibility until refactored */
export { evaluateAlerts as processAlert };
