// 5.2b — patrol-track-materialize worker.
//
// Registers the BullMQ worker for the patrol-track-materialize queue with
// a CONSERVATIVE rate limit: max 20 jobs per 1000ms (20 jobs/sec). This
// is intentionally lower than the 5.1c area-rederive worker's 50/sec
// ceiling because:
//
//   1. The EarthRanger /api/v1.0/subject/{id}/tracks endpoint typically
//      has stricter per-tenant rate limits than the events/patrols
//      endpoints (vendor-side budget — confirmed empirically over the
//      sync engine's lifetime, not in any public ER doc).
//   2. Each materialize job triggers a network round-trip to ER + a
//      potentially-large GeoJSON write back to Postgres (PatrolTrack.
//      trackGeojson can carry thousands of coordinates for long patrols),
//      so the per-job cost is higher than an in-process area derivation.
//   3. Admin tenant-wide rebuild (5.2c) can fan out to dozens of patrols
//      simultaneously — the limiter ensures we never burst above what ER
//      will tolerate.
//
// Concurrency=5 sits comfortably below the limiter ceiling: 5 in-flight
// jobs × ~200-500ms median per job (network-bound) ≈ 10-25 jobs/sec
// arithmetic ceiling, which the 20/sec limiter then enforces as the
// binding constraint. Tune downward if ER returns 429 under load; tune
// upward only after measuring sustained 20/sec without throttling.
//
// startPatrolTrackMaterializeWorker() is exported as a factory so
// start-workers.ts owns the lifecycle (graceful shutdown via
// worker.close() on SIGTERM/SIGINT, in lockstep with the other workers).

import type { Worker } from "bullmq";
import { QUEUE_NAMES } from "../queues/types";
import { createWorker } from "./base-worker";
import { processPatrolTrackMaterialize } from "../processors/patrol-track-materialize.processor";
import type { PatrolTrackMaterializeJobPayload } from "../queues/types";

/**
 * Conservative rate limit for the ER tracks endpoint: 20 jobs per 1000ms.
 * See the file header for the rationale. Exported for the worker test to
 * assert against without re-typing the literal numbers, and for ops
 * tuning (raise/lower together in DECISIONS_LOG if ER behavior changes).
 */
export const PATROL_TRACK_MATERIALIZE_LIMITER = {
  max: 20,
  duration: 1000,
} as const;

export const PATROL_TRACK_MATERIALIZE_CONCURRENCY = 5;

export function startPatrolTrackMaterializeWorker(): Worker<PatrolTrackMaterializeJobPayload> {
  return createWorker<PatrolTrackMaterializeJobPayload>(
    QUEUE_NAMES.PATROL_TRACK_MATERIALIZE,
    processPatrolTrackMaterialize,
    {
      concurrency: PATROL_TRACK_MATERIALIZE_CONCURRENCY,
      limiter: PATROL_TRACK_MATERIALIZE_LIMITER,
    },
  );
}
