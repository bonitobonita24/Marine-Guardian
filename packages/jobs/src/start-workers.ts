import { QUEUE_NAMES } from "./queues/types";
import { createWorker } from "./workers/base-worker";
import { processErSync } from "./processors/er-sync.processor";
import { processAlert } from "./processors/alerts.processor";
import { processEmail } from "./processors/email.processor";
import { processMaintenance } from "./processors/maintenance.processor";

console.log("[worker] Starting Marine Guardian workers...");

const workers = [
  createWorker(QUEUE_NAMES.ER_SYNC, processErSync, { concurrency: 2 }),
  createWorker(QUEUE_NAMES.ALERTS, processAlert, { concurrency: 3 }),
  createWorker(QUEUE_NAMES.EMAIL, processEmail, { concurrency: 5 }),
  createWorker(QUEUE_NAMES.MAINTENANCE, processMaintenance, { concurrency: 1 }),
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
