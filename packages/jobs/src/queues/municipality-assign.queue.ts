// municipality-assign queue.
//
// BullMQ Queue wrapper for async municipality + protected-zone assignment.
// Enqueued after:
//   - each Event upsert in er-sync.processor (lat/lon available immediately)
//   - each PatrolTrack write in patrol-track-materialize.processor
//     (deferred because the first track point is needed for Layer 1)
//
// JobId convention: `municipality-assign__${tenantId}__${entity}__${id}`
//   (double underscore — BullMQ rejects `:` in jobIds, lessons.md 🔴 2026-05-22)
// Idempotent: re-enqueuing the same (entity, id) pair while work for it is
// still PENDING collapses to one BullMQ job via the deterministic jobId.
//
// 🔴 2026-07-20 bugfix — "Clear municipality override" was a silent no-op.
// BullMQ's jobId dedupe applies regardless of the existing job's state, and
// completed jobs linger (removeOnComplete: { count: 1000 }), so re-enqueuing a
// row whose prior assign had already finished silently returned the stale
// terminal job without scheduling anything — while resolving successfully.
// Clearing an override (event.ts / patrol.ts) therefore dropped the manual
// lock but never recomputed the row, freezing it at its old value. The same
// defect silently skipped 8/23 staging and 10/19 prod rows during a bulk
// re-attribution catch-up. removeStaleTerminalJob() clears a completed/failed
// job under this id BEFORE add(); pending jobs are left alone so the dedupe
// above still holds. Full rationale: ./remove-stale-terminal-job.ts

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import { removeStaleTerminalJob } from "./remove-stale-terminal-job";
import type { MunicipalityAssignJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getMunicipalityAssignQueue(): Queue<MunicipalityAssignJobPayload> {
  return getQueue(QUEUE_NAMES.MUNICIPALITY_ASSIGN);
}

export async function enqueueMunicipalityAssign(
  payload: MunicipalityAssignJobPayload,
): Promise<string> {
  const queue = getMunicipalityAssignQueue();
  const jobId = `municipality-assign__${payload.tenantId}__${payload.entity}__${payload.id}`;

  // Clear a completed/failed job under this id first — see the 🔴 2026-07-20
  // note above. Pending jobs are left alone, so double-fires still collapse.
  await removeStaleTerminalJob(queue, jobId, "municipality-assign.queue");

  const job = await queue.add(
    `municipality-assign:${payload.entity}`,
    payload,
    { jobId },
  );
  return job.id ?? "";
}
