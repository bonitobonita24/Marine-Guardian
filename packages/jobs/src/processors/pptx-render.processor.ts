// V-pptx-export — pptx-render processor.
//
// BullMQ job handler for the on-demand "Render to PowerPoint" feature on
// the /exports page. This is strictly ON-DEMAND — never enqueued
// automatically, never part of the normal report generation pipeline
// (reportExport.create / pdf-render).
//
// DERIVED FROM REPORT DATA, NOT FROM THE STORED PDF (owner requirement,
// 2026-07-20). This processor used to download the already-rendered PDF from
// Telegram and rasterize it. That is gone, for two reasons:
//   1. The owner requires the PowerPoint be derived from the SAME report
//      data, not converted from a delivered artifact.
//   2. Report exports are now EPHEMERAL — the stored PDF object may be
//      purged within ~30 minutes, or the instant the user closes the export
//      dialog. Depending on it made this job fail for a normal, expected
//      lifecycle event.
//   So the PPTX render now drives its OWN Chromium render of the live
//   /print-render page, exactly as pdf-render.processor does.
//
// COST NOTE: a PPTX request therefore triggers a SECOND full Chromium render
// of the report (the PDF render is not reused). That is the accepted price of
// "derived from report data, not converted from the PDF".
//
// Pipeline:
//   1. Load the ReportExport row (id, tenantId) — defense-in-depth, same
//      posture as pdf-render.processor. The row must exist because it carries
//      paramsJson, which the /print-render page reads to rebuild the report.
//      There is NO precondition on the PDF's own status: this job renders
//      independently, so it does not care whether the PDF export succeeded,
//      failed, or was already purged.
//   2. Load the Tenant row for its slug (used in printUrl).
//   3. Build printUrl = WEB_APP_INTERNAL_URL + /print-render/<slug>/<type>/<id>
//      and call renderPdfViaService to obtain FRESH PDF bytes IN MEMORY.
//      These bytes are NEVER persisted — they exist only as the raster source
//      for the slides.
//   4. Rasterize every page via renderPdfPagesToPptx (pdfjs-dist + a
//      @napi-rs/canvas-backed canvas) and build the .pptx via pptxgenjs —
//      one full-bleed image slide per page.
//   5. SOLE store = MinIO (the exports bucket, via packages/storage
//      uploadObject), wrapped in the same bounded exponential-backoff retry.
//      There is NO size cap: the old 20 MB check was a Telegram Bot API
//      getFile constraint, and removing it is a core reason for this change.
//      NOTE: lib/telegram-storage.ts is still used for ER photo assets and
//      /api/assets — untouched here; only report exports moved off Telegram.
//   6. Update pptxStatus=ready + pptxFileSizeBytes + pptxTelegramFileId=null.
//      The PPTX object key is NOT persisted anywhere: buildPptxExportKey
//      (tenantId, exportId, at) is deterministic in tenantId/exportId, so
//      every reader recomputes it. Deliberate PM decision to avoid a
//      migration for a new column.
//
// Purged-row tolerance (mirrors pdf-render.processor):
//   - The initial load uses findFirst and RETURNS EARLY on null instead of
//     throwing — a purge mid-flight is NORMAL, and throwing would burn three
//     BullMQ retries and pollute the failure metrics.
//   - Every status write uses updateMany, which affects zero rows silently,
//     instead of update, which throws P2025 when the row is gone.
//   - If the row disappears between a SUCCESSFUL upload and the ready write
//     (updateMany count === 0), the object we just wrote is an orphan and is
//     deleted best-effort.
//
// Error path mirrors pdf-render.processor: on the LAST BullMQ attempt only,
// flip pptxStatus=failed + pptxErrorMessage before re-throwing (intermediate
// retries leave pptxStatus="rendering" so the UI doesn't flicker).
//
// NO AuditLog write here — reportExport.renderPptx (the tRPC mutation that
// enqueues this job) owns the EXPORT_PPTX_REQUESTED audit log, mirroring
// how reportExport.create owns EXPORT_REQUESTED and the download Route
// Handler owns EXPORT_DOWNLOAD/EXPORT_PPTX_DOWNLOAD.

import type { Job } from "bullmq";
import {
  platformPrisma,
  type ExtendedPrismaClient,
} from "@marine-guardian/db";
import type { PptxRenderJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import { renderPdfViaService } from "../lib/pdf-renderer-client";
import { renderPdfPagesToPptx } from "../lib/pdf-to-pptx";
import {
  assertBucketExists,
  buildPptxExportKey,
  deleteObject,
  getExportsBucketName,
  uploadObject,
} from "@marine-guardian/storage";

const prisma: ExtendedPrismaClient =
  platformPrisma as unknown as ExtendedPrismaClient;

const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export interface PptxRenderResult {
  exportId: string;
  status: "ready" | "failed";
  /**
   * MinIO object key of the stored .pptx. NOT persisted to any column —
   * readers recompute it with buildPptxExportKey.
   */
  filePath?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

/**
 * Duplicated from pdf-render.processor (LANDSCAPE_REPORT_TYPES is local to
 * that file, not exported — it is a render-time concern, not a spec-level
 * decision). Both processors render the SAME page, so the orientation must
 * match: `coverage` is a wide funder template and renders landscape; every
 * other report type (including report_map, which went portrait on
 * 2026-07-12) renders portrait. Keep in sync with the sibling processor.
 */
const LANDSCAPE_REPORT_TYPES: ReadonlySet<string> = new Set(["coverage"]);

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        const backoff = 1000 * Math.pow(2, attempt - 1);
        console.warn(
          `[pptx-render] retry ${String(attempt)}/${String(attempts - 1)} on ${label}: ${
            err instanceof Error ? err.message : String(err)
          } — waiting ${String(backoff)}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function isLastAttempt(job: Job<PptxRenderJobPayload>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

export async function processPptxRender(
  job: Job<PptxRenderJobPayload>,
): Promise<PptxRenderResult> {
  validateTenantContext(job.data);

  const { exportId, tenantId } = job.data;

  // findFirst (not findFirstOrThrow): report exports are ephemeral and the row
  // can legitimately be purged before the worker picks the job up. Expected
  // behaviour, not a failure — return early instead of throwing.
  const row = await prisma.reportExport.findFirst({
    where: { id: exportId, tenantId },
    select: {
      id: true,
      tenantId: true,
      reportType: true,
      paperSize: true,
      status: true,
    },
  });

  if (row === null) {
    console.info(
      `[pptx-render] export ${exportId} (tenant ${tenantId}) no longer exists — purged before render started; skipping`,
    );
    return {
      exportId,
      status: "failed",
      errorMessage: "export row no longer exists (purged)",
    };
  }

  // updateMany, not update: the row may have been purged between the load
  // above and here. update() would throw P2025.
  await prisma.reportExport.updateMany({
    where: { id: row.id },
    data: {
      pptxStatus: "rendering",
      pptxErrorMessage: null,
    },
  });

  try {
    const baseUrl = process.env.WEB_APP_INTERNAL_URL;
    if (baseUrl === undefined || baseUrl === "") {
      throw new Error(
        "WEB_APP_INTERNAL_URL is not configured — pptx-render processor cannot construct printUrl",
      );
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: row.tenantId },
      select: { id: true, slug: true },
    });

    // Fresh render of the LIVE report page — the stored PDF is never read.
    const printUrl = `${baseUrl}/print-render/${tenant.slug}/${row.reportType}/${row.id}`;
    const landscape = LANDSCAPE_REPORT_TYPES.has(row.reportType);

    const pdfBuffer = await renderPdfViaService({
      printUrl,
      paperSize: row.paperSize,
      landscape,
      exportId: row.id,
    });

    // In-memory only — these bytes are the raster source and are never stored.
    const pptxBuffer = await renderPdfPagesToPptx(new Uint8Array(pdfBuffer));

    const fileSizeBytes = pptxBuffer.length;

    const bucket = getExportsBucketName();
    await assertBucketExists(bucket);
    const key = buildPptxExportKey(row.tenantId, row.id, new Date());

    await withRetry("minio putObject", () =>
      uploadObject({
        bucket,
        key,
        body: pptxBuffer,
        contentType: PPTX_CONTENT_TYPE,
      }),
    );

    const readyWrite = await prisma.reportExport.updateMany({
      where: { id: row.id },
      data: {
        pptxStatus: "ready",
        pptxFileSizeBytes: fileSizeBytes,
        pptxErrorMessage: null,
        pptxTelegramFileId: null,
      },
    });

    if (readyWrite.count === 0) {
      // The row was purged while we were rendering/uploading, so the object we
      // just wrote can never be reached through it. Best-effort cleanup only:
      // a cleanup failure must never turn a successful render into a failure.
      try {
        await deleteObject({ bucket, key });
      } catch (cleanupErr) {
        console.warn(
          `[pptx-render] orphan cleanup failed for ${key}: ${
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr)
          }`,
        );
      }
      console.info(
        `[pptx-render] export ${row.id} was purged mid-render — orphaned object ${key} removed`,
      );
    }

    return {
      exportId: row.id,
      status: "ready",
      filePath: key,
      fileSizeBytes,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (isLastAttempt(job)) {
      await prisma.reportExport.updateMany({
        where: { id: row.id },
        data: {
          pptxStatus: "failed",
          pptxErrorMessage: errorMessage,
        },
      });
    }

    throw err;
  }
}
