// 5.2b — patrol-track-materialize queue.
//
// Wraps materializePatrolTrack (5.2a — packages/jobs/src/lib/patrol-track-
// materialization.ts) in a BullMQ Queue so per-patrol GPS track fetches from
// EarthRanger run out of the request path. Consumed by
// patrol-track-materialize.worker.ts and processed by
// patrol-track-materialize.processor.ts.
//
// JobId convention: `patrol-track-materialize__${tenantId}__${patrolId}` —
// (double underscore separator — BullMQ rejects `:` in jobIds with
// "Custom Id cannot contain :"; lessons.md 🔴 2026-05-22.)
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
//
// 🔴 2026-07-20 — that dedupe must only apply to PENDING work. BullMQ matches
// the jobId regardless of state and completed jobs linger (removeOnComplete:
// { count: 1000 }), so a deliberate later re-materialize of the same patrol
// (admin "rebuild track" after the first fetch already finished) silently
// returned the stale completed job and never re-fetched from ER.
// removeStaleTerminalJob() clears a terminal job under this id before add();
// pending jobs are untouched so the dedupe above still holds.
// Full rationale: ./remove-stale-terminal-job.ts

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import { removeStaleTerminalJob } from "./remove-stale-terminal-job";
import type { PatrolTrackMaterializeJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getPatrolTrackMaterializeQueue(): Queue<PatrolTrackMaterializeJobPayload> {
  return getQueue(QUEUE_NAMES.PATROL_TRACK_MATERIALIZE);
}

export async function enqueuePatrolTrackMaterialize(
  payload: PatrolTrackMaterializeJobPayload,
): Promise<string> {
  const queue = getPatrolTrackMaterializeQueue();
  const jobId = `patrol-track-materialize__${payload.tenantId}__${payload.patrolId}`;

  await removeStaleTerminalJob(queue, jobId, "patrol-track-materialize.queue");

  const job = await queue.add("patrol-track-materialize", payload, { jobId });
  return job.id ?? "";
}
