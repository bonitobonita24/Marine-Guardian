import { Worker, type Job, type Processor } from "bullmq";
import type { RateLimiterOptions } from "bullmq";
import { getConnection } from "../connection";
import type { BaseJobPayload, QueueName } from "../queues/types";

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
