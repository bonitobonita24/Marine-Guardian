// Export-janitor worker.
//
// Consumer side of the ephemeral-export TTL sweep. See
// processors/export-janitor.processor.ts for WHY this is the deletion
// authority (short version: the dialog-close purge is best-effort and does
// not run when a tab crashes — this does).
//
// concurrency = 1. This is serial housekeeping: two simultaneous sweeps would
// select overlapping expired rows and race to delete the same objects and
// rows, producing contention and noisy no-op deletes for zero throughput gain.
// One run every 5 minutes handling a bounded page is ample.

import type { Worker } from "bullmq";
import { QUEUE_NAMES } from "../queues/types";
import type { ExportJanitorJobPayload } from "../queues/types";
import { createWorker } from "./base-worker";
import { processExportJanitor } from "../processors/export-janitor.processor";

export const EXPORT_JANITOR_CONCURRENCY = 1;

export function startExportJanitorWorker(): Worker<ExportJanitorJobPayload> {
  return createWorker<ExportJanitorJobPayload>(
    QUEUE_NAMES.EXPORT_JANITOR,
    processExportJanitor,
    { concurrency: EXPORT_JANITOR_CONCURRENCY },
  );
}
