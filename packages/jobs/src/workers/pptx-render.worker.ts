// V-pptx-export — pptx-render worker.
//
// Registers the BullMQ worker for the on-demand pptx-render queue. Mirrors
// pdf-render.worker.ts's conservative-concurrency rationale: PDF
// rasterization via @napi-rs/canvas is CPU + memory heavy per page (similar
// order of magnitude to a Chromium PDF render, though single-process/no
// browser). Concurrency stays low; scale by running more worker replicas
// rather than raising in-process concurrency.
//
// startPptxRenderWorker() is exported as a factory so start-workers.ts owns
// the lifecycle (graceful shutdown via worker.close() on SIGTERM/SIGINT),
// same as every other worker in this package.

import type { Worker } from "bullmq";
import { QUEUE_NAMES } from "../queues/types";
import { createWorker } from "./base-worker";
import { processPptxRender } from "../processors/pptx-render.processor";
import type { PptxRenderJobPayload } from "../queues/types";

/**
 * PPTX rendering is strictly on-demand (a user explicitly clicks "Render
 * to PowerPoint" once per already-generated PDF) — traffic is inherently
 * low-volume and bursty rather than sustained, so a conservative limiter
 * is sufficient headroom without needing pdf-render's 5/sec ceiling.
 */
export const PPTX_RENDER_LIMITER = {
  max: 3,
  duration: 1000,
} as const;

export const PPTX_RENDER_CONCURRENCY = 2;

/**
 * BullMQ lock duration for this queue. Rasterizing + encoding a
 * multi-page report plus a Telegram upload should comfortably finish well
 * under this ceiling; set generously (matches PDF_RENDER_LOCK_DURATION_MS)
 * so a legitimately slow render (large report, many pages) is never
 * mistaken for a stalled job mid-render.
 */
export const PPTX_RENDER_LOCK_DURATION_MS = 150_000;

export function startPptxRenderWorker(): Worker<PptxRenderJobPayload> {
  return createWorker<PptxRenderJobPayload>(
    QUEUE_NAMES.PPTX_RENDER,
    processPptxRender,
    {
      concurrency: PPTX_RENDER_CONCURRENCY,
      limiter: PPTX_RENDER_LIMITER,
      lockDuration: PPTX_RENDER_LOCK_DURATION_MS,
    },
  );
}
