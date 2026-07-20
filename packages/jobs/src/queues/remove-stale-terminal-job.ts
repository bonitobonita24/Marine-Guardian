// Shared "clear the stale terminal job before re-adding" guard.
//
// 🔴 2026-07-20 — generalized from pdf-render.queue.ts, where this exact bug
// was diagnosed and fixed on 2026-07-05 but never applied to the sibling
// queues that share the same deterministic-jobId pattern. It then bit twice
// in one day on municipality-assign (see below), so the guard now lives in
// one place and every deterministic-jobId queue imports it.
//
// ── The BullMQ footgun ─────────────────────────────────────────────────────
// A deterministic jobId is how these queues DEDUPE: re-enqueuing the same row
// while work for it is still pending collapses to a single execution. That is
// deliberate and worth keeping.
//
// The trap is that BullMQ applies jobId dedupe REGARDLESS of the existing
// job's state. Our queues run with `removeOnComplete: { count: 1000 }` and
// `removeOnFail: { count: 5000 }` (queue-factory.ts), so a job that already
// COMPLETED lingers under its id. A later `queue.add()` with that same id does
// not schedule anything — it silently returns the pre-existing terminal job.
// Crucially it RESOLVES SUCCESSFULLY, so the caller (and any log line, and any
// "re-enqueued N rows" operator summary) reports success while nothing ran.
//
// Confirmed consequences before this fix:
//   1. "Clear municipality override" on an Event or Patrol dropped the manual
//      lock and re-enqueued, but the add() was dropped — the row was never
//      recomputed and stayed frozen at its old value instead of resuming
//      automatic attribution.
//   2. A bulk re-attribution catch-up found 8/23 (staging) and 10/19 (prod)
//      jobs already present; a plain re-enqueue would have silently done
//      nothing for more than half the cohort while reporting success.
//
// ── The fix ────────────────────────────────────────────────────────────────
// Clear the job under this id if — and ONLY if — it already reached a terminal
// state, then add(). Pending states (waiting/active/delayed/prioritized/
// waiting-children) are deliberately left alone, so genuine double-fires still
// collapse exactly as before. Net effect: a deliberate re-enqueue ALWAYS
// results in the processor running, and rapid duplicates still never create
// redundant work.
//
// Why not the alternatives:
//   - Dropping the jobId entirely would reintroduce duplicate-job storms (the
//     fan-out paths in areaBoundary.ts enqueue every row in a tenant).
//   - A monotonic/versioned jobId suffix defeats dedupe for the same reason.
//   - `removeOnComplete: 0` is a shared queue-factory setting affecting every
//     queue, destroys post-hoc job observability, and is still racy — any
//     retention window at all leaves the blocker in place.

import type { Job, Queue } from "bullmq";

/**
 * Job states from which no further execution will occur. A job sitting in one
 * of these is inert history — it can only block a new add() under the same id.
 */
const TERMINAL_JOB_STATES = new Set(["completed", "failed"]);

/**
 * Minimal structural shape this guard needs, so queue wrappers can pass their
 * concretely-typed Queue without a cast and tests can pass a stub.
 */
type JobLookup = Pick<Queue, "getJob">;

/**
 * Removes a prior job under `jobId` if — and only if — it already reached a
 * terminal state (completed/failed), so a subsequent `queue.add()` with that
 * same id schedules a REAL new execution instead of silently returning the
 * stale terminal job.
 *
 * Pending jobs (waiting/active/delayed/…) are left untouched: BullMQ's jobId
 * dedupe on those is the intended behaviour and still collapses genuine
 * double-fires to one execution.
 *
 * Best-effort and never throws — a Valkey hiccup here must not block the
 * enqueue itself. Worst case we fall back to BullMQ's stock behaviour, exactly
 * as before this guard existed.
 *
 * @param queue      the BullMQ queue (or any object exposing `getJob`)
 * @param jobId      the deterministic job id about to be re-added
 * @param queueLabel short queue name, for log attribution only
 */
export async function removeStaleTerminalJob(
  queue: JobLookup,
  jobId: string,
  queueLabel: string,
): Promise<void> {
  try {
    const existing: Job | undefined = await queue.getJob(jobId);
    if (existing == null) return;
    const state = await existing.getState();
    if (TERMINAL_JOB_STATES.has(state)) {
      await existing.remove();
    }
  } catch (err) {
    console.warn(
      `[${queueLabel}] removeStaleTerminalJob(${jobId}) failed — proceeding with add() as-is:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
