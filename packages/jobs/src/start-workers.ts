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

const workers = [
  createWorker(QUEUE_NAMES.ER_SYNC, processErSync, { concurrency: 2 }),
  createWorker(QUEUE_NAMES.ALERTS, processAlert, { concurrency: 3 }),
  createWorker(QUEUE_NAMES.EMAIL, processEmail, { concurrency: 5 }),
  createWorker(QUEUE_NAMES.MAINTENANCE, processMaintenance, { concurrency: 1 }),
  // municipality-assign — point-in-polygon attribution of each harvested
  // event/patrol. er-sync enqueues one job per synced entity (see
  // er-sync.processor enqueueMunicipalityAssign); this consumer was previously
  // MISSING, so jobs piled up unconsumed and new ER data never got attributed.
  createWorker(QUEUE_NAMES.MUNICIPALITY_ASSIGN, processMunicipalityAssign, {
    concurrency: 5,
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
