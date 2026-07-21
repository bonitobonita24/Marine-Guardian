// 5.1c — area-rederive worker.
//
// Registers the BullMQ worker for the area-rederive queue with the v2 spec
// L545 rate limit: max 50 jobs per 1000ms (50 jobs/sec). This caps Redis +
// Prisma load when an AreaBoundary mutation triggers a batch re-derive
// across thousands of historical Event/Patrol/FuelEntry rows.
//
// Concurrency=10 is chosen as a reasonable parallelism within the limiter
// envelope: 10 in-flight jobs × ~50ms median per job ≈ 200 jobs/sec
// arithmetic ceiling, well above the 50/sec limiter — so the limiter is
// the binding constraint and concurrency just keeps Redis fetch latency
// from becoming the bottleneck. Tune downward if Prisma connection pool
// pressure shows up under load.
//
// startAreaRederiveWorker() is exported as a factory so start-workers.ts
// owns the lifecycle (graceful shutdown via worker.close() on SIGTERM/SIGINT,
// in lockstep with the other workers).

import type { Worker } from "bullmq";
import { QUEUE_NAMES } from "../queues/types";
import { createWorker, EVENT_LOOP_BLOCKING_LOCK_DURATION_MS } from "./base-worker";
import { processAreaRederive } from "../processors/area-rederive.processor";
import type { AreaRederiveJobPayload } from "../queues/types";

/**
 * Rate limit per v2 spec L545: 50 jobs per 1000ms.
 * Exported for the worker test to assert against without re-typing the
 * literal numbers.
 */
export const AREA_REDERIVE_LIMITER = {
  max: 50,
  duration: 1000,
} as const;

export const AREA_REDERIVE_CONCURRENCY = 10;

export function startAreaRederiveWorker(): Worker<AreaRederiveJobPayload> {
  return createWorker<AreaRederiveJobPayload>(
    QUEUE_NAMES.AREA_REDERIVE,
    processAreaRederive,
    {
      concurrency: AREA_REDERIVE_CONCURRENCY,
      limiter: AREA_REDERIVE_LIMITER,
      // Sibling of the CPU-bound municipality-assign worker in the same
      // process — its 30s default lock was starved whenever a
      // municipality-assign job blocked the shared event loop, causing
      // re-run spirals. See EVENT_LOOP_BLOCKING_LOCK_DURATION_MS.
      lockDuration: EVENT_LOOP_BLOCKING_LOCK_DURATION_MS,
    },
  );
}
