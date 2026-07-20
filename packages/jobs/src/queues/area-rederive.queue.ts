// 5.1c — area-rederive queue.
//
// Wraps applyAreaDerivation (5.1b — packages/jobs/src/lib/area-derivation.ts)
// in a BullMQ Queue so name-match + nearest-fallback re-derivation runs out
// of the request path. Consumed by area-rederive.worker.ts and processed by
// area-rederive.processor.ts.
//
// JobId convention: `area-rederive__${tenantId}__${entity}__${id}` — guarantees
// (double underscore separator — BullMQ rejects `:` in jobIds with
// "Custom Id cannot contain :"; lessons.md 🔴 2026-05-22)
// idempotency at enqueue time. If the same row is re-derived twice in quick
// succession (e.g. boundary updated + row's areaName changed seconds apart),
// BullMQ dedupes via the jobId before any work is done; only the second
// invocation runs. The processor itself is also idempotent (5.1b doctrine —
// same input + same boundary set converges to same output, last write wins).
//
// 🔴 2026-07-20 — that dedupe only applies to PENDING work. BullMQ matches the
// jobId regardless of state and completed jobs linger (removeOnComplete:
// { count: 1000 }), so a legitimate later re-derive of the same row (a second
// boundary upload, an operator-triggered rebuild) silently returned the stale
// completed job and never re-ran. removeStaleTerminalJob() clears a terminal
// job under this id before add(); pending jobs are untouched so the dedupe
// above still holds. Full rationale: ./remove-stale-terminal-job.ts

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import { removeStaleTerminalJob } from "./remove-stale-terminal-job";
import type { AreaRederiveJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getAreaRederiveQueue(): Queue<AreaRederiveJobPayload> {
  return getQueue(QUEUE_NAMES.AREA_REDERIVE);
}

export async function enqueueAreaRederive(
  payload: AreaRederiveJobPayload,
): Promise<string> {
  const queue = getAreaRederiveQueue();
  const jobId = `area-rederive__${payload.tenantId}__${payload.entity}__${payload.id}`;

  await removeStaleTerminalJob(queue, jobId, "area-rederive.queue");

  const job = await queue.add(`area-rederive:${payload.entity}`, payload, {
    jobId,
  });
  return job.id ?? "";
}
