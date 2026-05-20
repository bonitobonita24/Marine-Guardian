// 5.2b — patrol-track-materialize queue.
//
// Wraps materializePatrolTrack (5.2a — packages/jobs/src/lib/patrol-track-
// materialization.ts) in a BullMQ Queue so per-patrol GPS track fetches from
// EarthRanger run out of the request path. Consumed by
// patrol-track-materialize.worker.ts and processed by
// patrol-track-materialize.processor.ts.
//
// JobId convention: `patrol-track-materialize:${tenantId}:${patrolId}` —
// guarantees idempotency at enqueue time. If the same patrol is enqueued
// twice in quick succession (e.g. 5.2c admin tenant-wide rebuild + a
// sync-driven enqueue racing on the same patrol), BullMQ dedupes via the
// jobId before any work is done; only the first invocation runs.
// The helper itself is also idempotent at the persistence layer (5.2a
// doctrine — atomic upsert keyed on patrolId unique, last write wins).
//
// userId is intentionally excluded from the jobId — the row identity is what
// matters for dedupe, not who triggered the refetch. Two rapid admin clicks
// from different operators on the same patrol should still collapse to one
// ER fetch.

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { PatrolTrackMaterializeJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getPatrolTrackMaterializeQueue(): Queue<PatrolTrackMaterializeJobPayload> {
  return getQueue(QUEUE_NAMES.PATROL_TRACK_MATERIALIZE);
}

export async function enqueuePatrolTrackMaterialize(
  payload: PatrolTrackMaterializeJobPayload,
): Promise<string> {
  const queue = getPatrolTrackMaterializeQueue();
  const job = await queue.add(
    "patrol-track-materialize",
    payload,
    {
      jobId: `patrol-track-materialize:${payload.tenantId}:${payload.patrolId}`,
    },
  );
  return job.id ?? "";
}
