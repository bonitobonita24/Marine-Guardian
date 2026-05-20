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
