// Sync-needed rescan queue.
//
// Drives the consumer side of the `Patrol.syncNeeded` drift marker. A
// scheduler (follow-up work — not wired in this session) periodically enqueues
// one rescan job per active tenant; the processor drains drift-flagged patrols
// by re-enqueueing their downstream materialization jobs. Consumed by a worker
// (follow-up) and processed by sync-needed-rescan.processor.ts.
//
// JobId convention: `sync-needed-rescan__${tenantId}__${ms}` — the timestamp
// suffix keeps successive scans for the same tenant distinct (double underscore
// separator — BullMQ rejects `:` in jobIds; lessons.md 🔴 2026-05-22).

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { SyncNeededRescanJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getSyncNeededRescanQueue(): Queue<SyncNeededRescanJobPayload> {
  return getQueue(QUEUE_NAMES.SYNC_NEEDED_RESCAN);
}

export async function enqueueSyncNeededRescan(
  payload: SyncNeededRescanJobPayload,
): Promise<string> {
  const queue = getSyncNeededRescanQueue();
  const job = await queue.add("sync-needed-rescan", payload, {
    jobId: `sync-needed-rescan__${payload.tenantId}__${String(Date.now())}`,
  });
  return job.id ?? "";
}
