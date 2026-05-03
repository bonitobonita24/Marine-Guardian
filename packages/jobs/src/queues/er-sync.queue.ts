import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory.js";
import type { ErSyncJobPayload } from "./types.js";
import { QUEUE_NAMES } from "./types.js";

export function getErSyncQueue(): Queue<ErSyncJobPayload> {
  return getQueue(QUEUE_NAMES.ER_SYNC);
}

export async function enqueueErSync(
  payload: ErSyncJobPayload,
): Promise<string> {
  const queue = getErSyncQueue();
  const job = await queue.add(`er-sync:${payload.syncType}`, payload, {
    jobId: `er-sync:${payload.tenantId}:${payload.syncType}:${Date.now()}`,
  });
  return job.id ?? "";
}

export async function scheduleRecurringErSync(
  tenantId: string,
  userId: string,
  intervalMs: number = 30_000,
): Promise<void> {
  const queue = getErSyncQueue();
  const syncTypes = [
    "events",
    "subjects",
    "patrols",
    "observations",
    "event_types",
  ] as const;

  for (const syncType of syncTypes) {
    await queue.add(
      `er-sync:recurring:${syncType}`,
      { tenantId, userId, syncType },
      {
        repeat: { every: intervalMs },
        jobId: `er-sync:recurring:${tenantId}:${syncType}`,
      },
    );
  }
}
