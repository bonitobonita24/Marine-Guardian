import { QUEUE_NAMES } from "./queues/types";
import { createWorker } from "./workers/base-worker";
import { processErSync } from "./processors/er-sync.processor";
import { processAlert } from "./processors/alerts.processor";
import { processEmail } from "./processors/email.processor";
import { processMaintenance } from "./processors/maintenance.processor";
import { startAreaRederiveWorker } from "./workers/area-rederive.worker";
import { startPatrolTrackMaterializeWorker } from "./workers/patrol-track-materialize.worker";
import { startPdfRenderWorker } from "./workers/pdf-render.worker";

console.log("[worker] Starting Marine Guardian workers...");

const workers = [
  createWorker(QUEUE_NAMES.ER_SYNC, processErSync, { concurrency: 2 }),
  createWorker(QUEUE_NAMES.ALERTS, processAlert, { concurrency: 3 }),
  createWorker(QUEUE_NAMES.EMAIL, processEmail, { concurrency: 5 }),
  createWorker(QUEUE_NAMES.MAINTENANCE, processMaintenance, { concurrency: 1 }),
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
];

console.log(`[worker] ${String(workers.length)} workers registered: ${Object.values(QUEUE_NAMES).join(", ")}`);

async function shutdown(): Promise<void> {
  console.log("[worker] Shutting down gracefully...");
  await Promise.all(workers.map((w) => w.close()));
  console.log("[worker] All workers closed.");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
