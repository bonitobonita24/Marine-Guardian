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
// Idempotent: re-enqueuing the same (entity, id) pair within a short window
// collapses to one BullMQ job via the deterministic jobId.

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { MunicipalityAssignJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getMunicipalityAssignQueue(): Queue<MunicipalityAssignJobPayload> {
  return getQueue(QUEUE_NAMES.MUNICIPALITY_ASSIGN);
}

export async function enqueueMunicipalityAssign(
  payload: MunicipalityAssignJobPayload,
): Promise<string> {
  const queue = getMunicipalityAssignQueue();
  const job = await queue.add(
    `municipality-assign:${payload.entity}`,
    payload,
    {
      jobId: `municipality-assign__${payload.tenantId}__${payload.entity}__${payload.id}`,
    },
  );
  return job.id ?? "";
}
