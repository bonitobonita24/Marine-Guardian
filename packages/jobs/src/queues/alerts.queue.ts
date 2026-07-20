// ⚠ DELIBERATELY NOT using removeStaleTerminalJob (2026-07-20).
//
// Every other deterministic-jobId queue in this folder clears a completed job
// before re-adding, because for those a re-enqueue means "recompute this row"
// and must always run. Alerts are the opposite: the jobId
// `alert__{tenantId}__{alertRuleId}__{eventId}` encodes a
// (rule × event) pair that must notify recipients EXACTLY ONCE, ever. Here the
// retained completed job IS the fire-once guard — clearing it would re-send
// notifications for an alert that already fired (e.g. on any later re-sync
// touching the same event).
//
// So: do not "generalize the fix" to this queue. The dedupe semantics differ.

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
