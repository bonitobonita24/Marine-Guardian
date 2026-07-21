import { Worker, type Job, type Processor } from "bullmq";
import type { RateLimiterOptions } from "bullmq";
import { getConnection } from "../connection";
import type { BaseJobPayload, QueueName } from "../queues/types";

/**
 * Lock duration (ms) for a worker that shares its Node PROCESS with a
 * CPU-bound geometry worker (municipality-assign) — i.e. every worker in
 * start-workers.ts, which registers them all in ONE process / ONE event loop.
 *
 * ⚠ CROSS-QUEUE STARVATION (measured defect, 2026-07): the original
 * municipality-assign incident raised ONLY that queue's lockDuration to 15min
 * (see MUNICIPALITY_ASSIGN_LOCK_DURATION_MS in start-workers.ts), but left its
 * SIBLINGS (area-rederive, patrol-track-materialize) on BullMQ's 30s default.
 * That is not enough. BullMQ's per-job lock-renewal is a single timer PER
 * WORKER PROCESS that only fires when the event loop is free. When a
 * municipality-assign job blocks the loop for minutes doing synchronous turf
 * math (see the CAVEAT on WorkerOptions.lockDuration below), the renewal
 * timers for EVERY other queue in the process are starved too — so even the
 * IO-bound patrol-track-materialize jobs (whose own work is short and would
 * normally be safe under renewal) lose their 30s lock, get flagged stalled,
 * and are re-run from scratch. Prod was observed re-running a single
 * patrol-track-materialize job 16×, pinning a core at ~100%.
 *
 * FIX: any queue co-resident with the geometry workers must set its
 * lockDuration >= the worst-case time the shared event loop can be blocked,
 * NOT just its own runtime. 900000ms (15min) matches the ceiling already
 * proven for municipality-assign (~3.75x the observed ~4min staging worst
 * case), so a sibling job survives a full municipality-assign stall.
 *
 * TRADEOFF (accepted, same as municipality-assign): a genuinely-dead worker's
 * job waits up to 15min before another worker reclaims it. These are
 * idempotent background geometry jobs — acceptable. The real cure for the
 * event-loop blocking itself is to yield during the synchronous geometry
 * (see @marine-guardian/shared/lib/municipality-assignment); this lock ceiling
 * is the belt-and-suspenders that stops the re-run spiral regardless.
 */
export const EVENT_LOOP_BLOCKING_LOCK_DURATION_MS = 900_000;

export interface WorkerOptions {
  concurrency?: number;
  /**
   * Optional BullMQ rate limiter. Caps `max` jobs per `duration` (ms) across
   * all worker threads on this queue. Used by the 5.1c area-rederive worker
   * to enforce the v2 spec L545 ceiling of 50 jobs/sec.
   * See https://docs.bullmq.io/guide/rate-limiting
   */
  limiter?: RateLimiterOptions;
  /**
   * Optional explicit BullMQ lock duration (ms) — how long a job may hold
   * its processing lock before BullMQ considers it stalled.
   *
   * ⚠ CAVEAT (do not "fix" this back to trusting renewal — see
   * municipality-assign incident, 2026-07): BullMQ's lock-renewal is a
   * TIMER that fires every lockDuration/2 while the processor promise is
   * pending. That renewal ONLY protects an IO-BOUND processor, where
   * `await` regularly yields the event loop so the timer gets a chance to
   * run. It does NOT protect a processor that does heavy SYNCHRONOUS
   * CPU work between awaits (e.g. turf.js point-in-polygon / geometry
   * math over thousands of points) — synchronous work blocks the Node
   * event loop, so the renewal timer never fires and the lock simply
   * expires once `lockDuration` elapses (the default 30000ms when this
   * option is unset). Renewal cannot extend it, so whatever value is set
   * here must cover the ENTIRE synchronous run on its own; otherwise
   * BullMQ logs "Missing lock for job ... moveToFinished" and re-runs
   * the job from the start. (Confirmed against BullMQ's own docs: a
   * CPU-intensive processor "stalled the Node event loop, and as a
   * result Bull couldn't renew the job lock.")
   *
   * ⚠ The IO-bound vs CPU-bound distinction IS the whole trap — it is
   * what made this defect invisible for so long. "BullMQ auto-renews,
   * so long jobs are safe" is a TRUE statement about IO-bound work and
   * a FALSE one about CPU-bound work. Do not collapse the two.
   *
   * So: for a queue whose processor legitimately runs longer than the
   * default (30000ms) — whether from long IO or from synchronous CPU
   * work — set `lockDuration` explicitly to >= the expected worst-case
   * TOTAL processing time. For a CPU-bound processor in particular, do
   * NOT rely on renewal timing at all; the ceiling must cover the whole
   * run by itself. Used by the pdf-render worker (renders can take up to
   * PDF_NAV_TIMEOUT_MS ~120s, IO-bound — renewal helps here) and the
   * municipality-assign worker (synchronous turf geometry over track
   * points, observed ~4min worst case on staging — renewal does NOT
   * help here; see MUNICIPALITY_ASSIGN_LOCK_DURATION_MS in
   * start-workers.ts).
   */
  lockDuration?: number;
}

export function createWorker<T extends BaseJobPayload>(
  queueName: QueueName,
  processor: Processor<T>,
  options?: WorkerOptions,
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: getConnection(),
    concurrency: options?.concurrency ?? 1,
    autorun: true,
    ...(options?.limiter !== undefined ? { limiter: options.limiter } : {}),
    ...(options?.lockDuration !== undefined
      ? { lockDuration: options.lockDuration }
      : {}),
  });

  worker.on("failed", (job: Job<T> | undefined, err: Error) => {
    console.error(
      `[${queueName}] Job ${job?.id ?? "unknown"} failed:`,
      err.message,
    );
  });

  worker.on("completed", (job: Job<T>) => {
    console.log(`[${queueName}] Job ${job.id ?? "unknown"} completed`);
  });

  return worker;
}

export function validateTenantContext(payload: BaseJobPayload): void {
  if (payload.tenantId === "") {
    throw new Error("Job payload missing tenantId — cannot process without tenant context");
  }
  if (payload.userId === "") {
    throw new Error("Job payload missing userId — cannot process without user context");
  }
}
