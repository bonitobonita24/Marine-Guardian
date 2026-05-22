import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { AlertJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getAlertsQueue(): Queue<AlertJobPayload> {
  return getQueue(QUEUE_NAMES.ALERTS);
}

export async function enqueueAlert(payload: AlertJobPayload): Promise<string> {
  const queue = getAlertsQueue();
  const job = await queue.add("alert:evaluate", payload, {
    priority: payload.priority,
    jobId: `alert__${payload.tenantId}__${payload.alertRuleId}__${payload.eventId}`,
  });
  return job.id ?? "";
}
