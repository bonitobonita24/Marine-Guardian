import { QUEUE_NAMES } from "./queues/types";
import { createWorker } from "./workers/base-worker";
import { processErSync } from "./processors/er-sync.processor";
import { processAlert } from "./processors/alerts.processor";
import { processEmail } from "./processors/email.processor";
import { processMaintenance } from "./processors/maintenance.processor";
import { processMunicipalityAssign } from "./processors/municipality-assign.processor";
import { startAreaRederiveWorker } from "./workers/area-rederive.worker";
import { startPatrolTrackMaterializeWorker } from "./workers/patrol-track-materialize.worker";
import { startPdfRenderWorker } from "./workers/pdf-render.worker";
import { startPptxRenderWorker } from "./workers/pptx-render.worker";
import { startExportJanitorWorker } from "./workers/export-janitor.worker";
import { scheduleRecurringErSync, removeRecurringErSync } from "./queues/er-sync.queue";
import { scheduleRecurringExportJanitor } from "./queues/export-janitor.queue";
import { platformPrisma } from "@marine-guardian/db";

console.log("[worker] Starting Marine Guardian workers...");

/**
 * BullMQ lock duration for the municipality-assign queue.
 *
 * MEASURED DEFECT (2026-07): staging observed municipality-assign jobs
 * running ~4 minutes each, well past BullMQ's default lockDuration
 * (30000ms). The processor is idempotent so DB data still converged
 * correctly, but every long job lost its lock mid-flight ("Missing lock
 * for job ... moveToFinished") and was re-run from scratch, inflating
 * work and making the queue's completed/failed counters untrustworthy
 * (failed sat at 734 while the DB was actually fine).
 *
 * ROOT CAUSE: this processor is NOT IO-bound in the way BullMQ's lock
 * auto-renewal assumes. It runs synchronous turf.js point-in-polygon /
 * containment + terrain-classification math (see
 * @marine-guardian/shared/lib/municipality-assignment, used by
 * processors/municipality-assign.processor.ts) over every point of a
 * patrol's materialized track. That work blocks the Node event loop, so
 * BullMQ's lock-renewal timer (which only fires between awaits) never
 * gets a chance to run — renewal cannot be relied on here at all (see
 * the CAVEAT on WorkerOptions.lockDuration in workers/base-worker.ts).
 * lockDuration must instead cover the worst-case TOTAL synchronous
 * runtime by itself.
 *
 * SIZING: real-data measurement (dev, 200 patrols, tenant "ph", 16
 * municipalities) put geometry-only cost at mean 1302.7ms/patrol, p95
 * 7750.4ms, max 22018.2ms per patrol. Staging's observed ~4min/job
 * (240000ms) reflects slower shared CPU + larger tracks + DB IO on top
 * of that geometry cost. 900000ms (15 minutes) gives ~3.75x headroom
 * over the observed 4-minute staging worst case.
 */
export const MUNICIPALITY_ASSIGN_LOCK_DURATION_MS = 900_000;

const workers = [
  createWorker(QUEUE_NAMES.ER_SYNC, processErSync, { concurrency: 2 }),
  createWorker(QUEUE_NAMES.ALERTS, processAlert, { concurrency: 3 }),
  createWorker(QUEUE_NAMES.EMAIL, processEmail, { concurrency: 5 }),
  createWorker(QUEUE_NAMES.MAINTENANCE, processMaintenance, { concurrency: 1 }),
  // municipality-assign — point-in-polygon attribution of each harvested
  // event/patrol. er-sync enqueues one job per synced entity (see
  // er-sync.processor enqueueMunicipalityAssign); this consumer was previously
  // MISSING, so jobs piled up unconsumed and new ER data never got attributed.
  //
  // lockDuration = MUNICIPALITY_ASSIGN_LOCK_DURATION_MS (900000ms / 15min) —
  // NOT the default 30000ms. This processor runs synchronous turf geometry
  // (blocks the event loop), so BullMQ's lock-renewal timer cannot fire
  // mid-job — see the constant's doc comment above and the CAVEAT on
  // WorkerOptions.lockDuration in workers/base-worker.ts. Without this, a
  // ~4min job (observed on staging) loses its lock at 30s and gets silently
  // re-run from scratch every time.
  //
  // stalledInterval / maxStalledCount are left at BullMQ defaults (30000ms /
  // 1) deliberately — DO NOT "fix" these again. stalledInterval only
  // controls how OFTEN the stalled-check runs; a job is only flagged
  // stalled if its lock has actually expired, so once lockDuration is
  // correctly sized above the worst-case runtime, the default check
  // interval is harmless. Raising maxStalledCount would instead let a
  // genuinely-stuck job silently retry more times before failing, masking
  // real stalls — it is not the fix for a lock-duration-vs-runtime mismatch.
  createWorker(QUEUE_NAMES.MUNICIPALITY_ASSIGN, processMunicipalityAssign, {
    concurrency: 5,
    lockDuration: MUNICIPALITY_ASSIGN_LOCK_DURATION_MS,
  }),
  // 5.1c — area-rederive worker. Concurrency + rate-limit live inside the
  // factory (see workers/area-rederive.worker.ts) to keep the v2 spec L545
  // ceiling co-located with the worker registration.
  startAreaRederiveWorker(),
  // 5.2b — patrol-track-materialize worker. Concurrency=5 + conservative
  // limiter (20/sec) live inside the factory (see workers/patrol-track-
  // materialize.worker.ts) — the ER tracks endpoint typically has stricter
  // rate limits than events/patrols, so this caps the per-tenant burst
  // from 5.2c admin tenant-wide rebuild.
  startPatrolTrackMaterializeWorker(),
  // 5.3b — pdf-render worker. Concurrency=2 + limiter 5/sec live inside the
  // factory (see workers/pdf-render.worker.ts) per DECISIONS_LOG
  // "Puppeteer Concurrency + Rate Limiter" lock — Chromium PDF rendering
  // is heavy on CPU + memory (~300-500MB resident per browser instance,
  // ~1-3s per page), so concurrency stays low to avoid OOM and the
  // limiter smooths bursty admin "rebuild all reports" actions.
  startPdfRenderWorker(),
  // V-pptx-export — pptx-render worker. Strictly on-demand (a user
  // explicitly clicks "Render to PowerPoint" on an already-generated PDF
  // export) — never fired automatically alongside pdf-render. Concurrency
  // + limiter live inside the factory (see workers/pptx-render.worker.ts).
  startPptxRenderWorker(),
  // export-janitor — THE DELETION AUTHORITY for ephemeral report exports.
  // Report exports are disposable; the export dialog purges them on close, but
  // that is best-effort only and never runs when a tab crashes, the machine
  // sleeps, or the connection drops — which would orphan objects forever.
  // This server-side TTL sweep (every 5 minutes, ~30 min lifetime) is what
  // actually guarantees they go away, plus a bucket sweep for objects that
  // outlived their row. Concurrency=1 — serial housekeeping. See
  // processors/export-janitor.processor.ts.
  startExportJanitorWorker(),
];

// Log the ACTUALLY-registered queues (each BullMQ Worker exposes .name = its
// queue) — not Object.values(QUEUE_NAMES), which lists queue names whether or
// not a worker consumes them (the trap that hid the missing municipality-assign
// consumer).
console.log(`[worker] ${String(workers.length)} workers registered: ${workers.map((w) => w.name).join(", ")}`);

/**
 * ops-milestone-1 — Bootstrap recurring ER sync for all tenants with a
 * verified (status='connected') ER connection and recurringEnabled=true.
 *
 * Runs once at worker startup. Each enabled tenant gets BullMQ repeatable
 * jobs registered for all sync types. Tenants with recurringEnabled=false
 * (or status != 'connected') have their repeatables removed (idempotent
 * cleanup in case the toggle was turned off while the worker was down).
 *
 * q-ops-07 guarantee: `scheduleRecurringErSync` embeds the current watermark
 * from SyncLog into the payload — the first repeatable firing is already
 * delta-scoped if a prior successful sync exists.
 */
async function bootstrapRecurringErSync(): Promise<void> {
  try {
    const connections = await platformPrisma.tenantErConnection.findMany({
      select: {
        tenantId: true,
        status: true,
        recurringEnabled: true,
        intervalMs: true,
      },
    });

    for (const conn of connections) {
      const isVerified = conn.status === "connected";
      const shouldRun = isVerified && conn.recurringEnabled;

      if (shouldRun) {
        await scheduleRecurringErSync(
          conn.tenantId,
          "system",
          conn.intervalMs,
        );
        console.log(
          `[worker] Recurring ER sync scheduled for tenant ${conn.tenantId} every ${String(conn.intervalMs)}ms`,
        );
      } else {
        // Remove any stale repeatable jobs in case the toggle was turned off
        // while the worker was down, or the connection became invalid.
        await removeRecurringErSync(conn.tenantId);
        if (conn.recurringEnabled) {
          // enabled but not verified — log the skip reason
          console.log(
            `[worker] Skipping recurring ER sync for tenant ${conn.tenantId} — connection not verified (status: ${conn.status})`,
          );
        }
      }
    }
  } catch (err) {
    // Non-fatal — log and continue. Workers themselves are running.
    console.error(
      "[worker] bootstrapRecurringErSync failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

void bootstrapRecurringErSync();

// Register the export-janitor repeatable. Fixed jobId
// (`export-janitor__recurring`) makes this idempotent across worker reboots.
void scheduleRecurringExportJanitor();

async function shutdown(): Promise<void> {
  console.log("[worker] Shutting down gracefully...");
  await Promise.all(workers.map((w) => w.close()));
  console.log("[worker] All workers closed.");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
