import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory.js";
import type { MaintenanceJobPayload } from "./types.js";
import { QUEUE_NAMES } from "./types.js";

export function getMaintenanceQueue(): Queue<MaintenanceJobPayload> {
  return getQueue(QUEUE_NAMES.MAINTENANCE);
}

export async function enqueueMaintenance(
  payload: MaintenanceJobPayload,
): Promise<string> {
  const queue = getMaintenanceQueue();
  const job = await queue.add(`maintenance:${payload.task}`, payload, {
    jobId: `maintenance:${payload.tenantId}:${payload.task}:${Date.now()}`,
  });
  return job.id ?? "";
}

export async function scheduleRecurringMaintenance(
  tenantId: string,
  userId: string,
): Promise<void> {
  const queue = getMaintenanceQueue();

  await queue.add(
    "maintenance:cleanup_old_sync_logs",
    { tenantId, userId, task: "cleanup_old_sync_logs" as const },
    {
      repeat: { pattern: "0 3 * * *" },
      jobId: `maintenance:recurring:${tenantId}:cleanup_old_sync_logs`,
    },
  );

  await queue.add(
    "maintenance:archive_resolved_events",
    { tenantId, userId, task: "archive_resolved_events" as const },
    {
      repeat: { pattern: "0 4 * * 0" },
      jobId: `maintenance:recurring:${tenantId}:archive_resolved_events`,
    },
  );
}
