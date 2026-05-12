import type { Job } from "bullmq";
import { platformPrisma } from "@marine-guardian/db";
import type { AlertJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";

interface ConditionJson {
  eventTypeId?: string;
  minPriority?: number;
}

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

  for (const rule of matchingRules) {
    const recipients = (await platformPrisma.user.findMany({
      where: { tenantId, role: { in: ["site_admin", "super_admin"] } },
    })) as Recipient[];

    if (recipients.length === 0) {
      continue;
    }

    await platformPrisma.$transaction(async (tx) => {
      const typedTx = tx as unknown as {
        notification: { create: (args: Record<string, unknown>) => Promise<unknown> };
        auditLog: { create: (args: Record<string, unknown>) => Promise<unknown> };
        alertHistory: { create: (args: Record<string, unknown>) => Promise<unknown> };
      };

      for (const recipient of recipients) {
        await typedTx.notification.create({
          data: {
            tenantId,
            userId: recipient.id,
            alertRuleId: rule.id,
            eventId: event.id,
            isRead: false,
            title: rule.name,
            message: `Event "${event.title}" triggered alert rule "${rule.name}"`,
            notificationType: "warning",
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
  }

  return { rulesEvaluated, rulesMatched, notificationsCreated };
}

/** @deprecated use evaluateAlerts — kept for start-workers.ts compatibility until refactored */
export { evaluateAlerts as processAlert };
