// 5.3b — pdf-render queue.
//
// Producer side of the pdf-render pipeline. Wraps the
// renderPdfViaService client (5.3a — relocated to
// packages/jobs/src/lib/pdf-renderer-client.ts in this sub-batch) in a
// BullMQ Queue so per-export Puppeteer renders run out of the request
// path. Consumed by pdf-render.worker.ts and processed by
// pdf-render.processor.ts.
//
// JobId convention: `pdf-render__${exportId}` — guarantees idempotency at
// (double underscore separator — BullMQ rejects `:` in jobIds with
// "Custom Id cannot contain :"; lessons.md 🔴 2026-05-22.)
// enqueue time. exportId is the ReportExport.id PK (cuid, globally
// unique across all tenants), so tenant scoping in the jobId would be
// redundant. If the same export is enqueued twice in quick succession
// (reportExport.create double-fire racing the 5.3d retry button on the
// same exportId, or two rapid admin clicks on retry), BullMQ dedupes
// via the jobId before any work is done; only the first invocation
// runs. The processor itself is also idempotent at the persistence
// layer (status transition queued → rendering → ready is atomic per
// row, last write wins on the unique PK).
//
// tenantId + userId are NOT part of the jobId on purpose. exportId is
// the row identity that owns this render; the row carries its own
// tenantId, and re-enqueues from different users (e.g. two admins each
// hitting retry) should still collapse to one Puppeteer render.

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { PdfRenderJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getPdfRenderQueue(): Queue<PdfRenderJobPayload> {
  return getQueue(QUEUE_NAMES.PDF_RENDER);
}

/**
 * Max time we wait for the BullMQ producer `queue.add` to resolve before
 * giving up. The shared Redis/Valkey connection uses `maxRetriesPerRequest:
 * null` (required by BullMQ for blocking worker commands), which means a
 * command issued while Valkey is unreachable retries FOREVER rather than
 * reject. Without this bound, `enqueuePdfRender` — called inside the
 * reportExport.create request path — hangs indefinitely, the tRPC request
 * never returns, and the upstream proxy eventually 524s while the UI sits on
 * "Queuing…". A bounded race converts an infinite hang into a fast, catchable
 * failure the caller can degrade on gracefully.
 */
const ENQUEUE_TIMEOUT_MS = 5000;

export class EnqueueTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnqueueTimeoutError";
  }
}

export async function enqueuePdfRender(
  payload: PdfRenderJobPayload,
): Promise<string> {
  const queue = getPdfRenderQueue();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new EnqueueTimeoutError(
          `enqueuePdfRender timed out after ${String(ENQUEUE_TIMEOUT_MS)}ms (Valkey/Redis unreachable?)`,
        ),
      );
    }, ENQUEUE_TIMEOUT_MS);
  });

  try {
    const job = await Promise.race([
      queue.add("pdf-render", payload, {
        jobId: `pdf-render__${payload.exportId}`,
      }),
      timeout,
    ]);
    return job.id ?? "";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
