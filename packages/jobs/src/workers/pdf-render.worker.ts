// 5.3b — pdf-render worker.
//
// Registers the BullMQ worker for the pdf-render queue per DECISIONS_LOG
// "Puppeteer Concurrency + Rate Limiter" lock (Phase 8 Batch 5 Sub-batch
// 5.3a). Conservative defaults sized for Chromium's resource footprint:
//
//   - concurrency = 2 — two concurrent renders per worker container.
//     Chromium PDF rendering carries ~300-500MB resident per browser
//     instance + ~1-3s per page render. Two in-flight renders sit
//     comfortably under typical 2GB+ container memory limits on staging
//     and prod. Scale throughput by running multiple worker container
//     replicas (each gets its own pdf-renderer service connection)
//     rather than raising the in-process concurrency.
//
//   - limiter = { max: 5, duration: 1000 } — 5 jobs/sec per worker.
//     Smooths bursty admin "rebuild all reports" actions without
//     backlogging the queue. v2 PRODUCT.md §776-779 typical render
//     latency 3-30s — 5/sec arithmetic ceiling exceeds the in-process
//     concurrency=2 limit so the limiter only kicks in during very
//     short renders (sub-200ms) or when multiple jobs queue up between
//     long-running renders.
//
// Tune downward if pdf-renderer reports OOM or 5xx errors under load;
// tune upward only after production telemetry justifies a change.
//
// startPdfRenderWorker() is exported as a factory so start-workers.ts
// owns the lifecycle (graceful shutdown via worker.close() on
// SIGTERM/SIGINT, in lockstep with the other workers).

import type { Worker } from "bullmq";
import { QUEUE_NAMES } from "../queues/types";
import { createWorker } from "./base-worker";
import { processPdfRender } from "../processors/pdf-render.processor";
import type { PdfRenderJobPayload } from "../queues/types";

/**
 * Per-worker rate limit for the pdf-renderer service: 5 jobs per 1000ms.
 * See the file header for the rationale. Exported for the worker test
 * to assert against without re-typing the literal numbers, and for ops
 * tuning (raise/lower together in DECISIONS_LOG if Chromium behavior
 * changes).
 */
export const PDF_RENDER_LIMITER = {
  max: 5,
  duration: 1000,
} as const;

export const PDF_RENDER_CONCURRENCY = 2;

export function startPdfRenderWorker(): Worker<PdfRenderJobPayload> {
  return createWorker<PdfRenderJobPayload>(
    QUEUE_NAMES.PDF_RENDER,
    processPdfRender,
    {
      concurrency: PDF_RENDER_CONCURRENCY,
      limiter: PDF_RENDER_LIMITER,
    },
  );
}
