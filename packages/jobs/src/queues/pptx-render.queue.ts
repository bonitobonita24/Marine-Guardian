// V-pptx-export — pptx-render queue.
//
// Producer side of the on-demand PDF→PowerPoint pipeline. Mirrors
// pdf-render.queue.ts exactly (same jobId dedupe + stale-terminal-job +
// bounded-enqueue-timeout patterns) — see that file's header comment for
// the full rationale of each guard. Consumed by pptx-render.worker.ts and
// processed by pptx-render.processor.ts.
//
// JobId convention: `pptx-render__${exportId}` (double underscore — BullMQ
// rejects `:` in jobIds). exportId is the ReportExport.id PK (cuid,
// globally unique across all tenants), so tenant scoping in the jobId
// would be redundant — a second "Render to PowerPoint" click on the same
// export collapses to the first in-flight job.

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { PptxRenderJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

const TERMINAL_JOB_STATES = new Set(["completed", "failed"]);

/**
 * Removes a prior job under `jobId` if — and only if — it already reached
 * a terminal state (completed/failed), same rationale as pdf-render.queue's
 * removeStaleTerminalJob: a re-request after a completed/failed prior PPTX
 * render must actually re-run, not silently return the stale terminal job.
 * Best-effort — any failure here is swallowed so add() can still proceed.
 */
async function removeStaleTerminalJob(
  queue: Queue<PptxRenderJobPayload>,
  jobId: string,
): Promise<void> {
  try {
    const existing = await queue.getJob(jobId);
    if (existing === undefined) return;
    const state = await existing.getState();
    if (TERMINAL_JOB_STATES.has(state)) {
      await existing.remove();
    }
  } catch (err) {
    console.warn(
      `[pptx-render.queue] removeStaleTerminalJob(${jobId}) failed — proceeding with add() as-is:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function getPptxRenderQueue(): Queue<PptxRenderJobPayload> {
  return getQueue(QUEUE_NAMES.PPTX_RENDER);
}

/**
 * cancelPptxRender — best-effort removal of a still-pending BullMQ job for
 * `exportId`. Mirrors cancelPdfRender's active-job caveat: a job the worker
 * already holds ACTIVE cannot be force-removed and this is a no-op in that
 * case. Never throws.
 */
export async function cancelPptxRender(exportId: string): Promise<void> {
  const queue = getPptxRenderQueue();
  const jobId = `pptx-render__${exportId}`;
  try {
    const job = await queue.getJob(jobId);
    if (job === undefined) return;
    const state = await job.getState();
    if (state === "active") {
      console.warn(
        `[pptx-render.queue] cancelPptxRender(${exportId}): job is active (worker holds lock) — leaving the BullMQ job in place; DB row still reflects the requested state`,
      );
      return;
    }
    await job.remove();
  } catch (err) {
    console.warn(
      `[pptx-render.queue] cancelPptxRender(${exportId}) failed — proceeding:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Same bounded-enqueue-timeout rationale as pdf-render.queue's
 * ENQUEUE_TIMEOUT_MS — the shared Valkey connection uses
 * `maxRetriesPerRequest: null`, so a command issued while Valkey is
 * unreachable would otherwise hang the tRPC request forever.
 */
const ENQUEUE_TIMEOUT_MS = 5000;

export class PptxEnqueueTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PptxEnqueueTimeoutError";
  }
}

export async function enqueuePptxRender(
  payload: PptxRenderJobPayload,
): Promise<string> {
  const queue = getPptxRenderQueue();
  const jobId = `pptx-render__${payload.exportId}`;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new PptxEnqueueTimeoutError(
          `enqueuePptxRender timed out after ${String(ENQUEUE_TIMEOUT_MS)}ms (Valkey/Redis unreachable?)`,
        ),
      );
    }, ENQUEUE_TIMEOUT_MS);
  });

  try {
    const job = await Promise.race([
      (async () => {
        await removeStaleTerminalJob(queue, jobId);
        return queue.add("pptx-render", payload, { jobId });
      })(),
      timeout,
    ]);
    return job.id ?? "";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
