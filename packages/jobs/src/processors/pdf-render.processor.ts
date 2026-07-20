// 5.3b — pdf-render processor.
//
// BullMQ job handler that drives a single ReportExport row through the
// queued → rendering → ready (or failed) lifecycle per v2 PRODUCT.md
// §505-506 + §776-779.
//
// Steps per job:
//   1. Validate tenant context (BaseJobPayload sanity check).
//   2. Load the ReportExport row scoped by (id, tenantId) — defense-in-
//      depth even though exportId is globally unique cuid. Cross-tenant
//      access through this processor should be impossible.
//   3. Load the Tenant row by id to obtain the slug used in printUrl.
//   4. Update status queued → rendering (atomic). On the retry path
//      (attemptsMade > 0) the row may already be `rendering` from the
//      previous attempt — the update is still safe; the status enum
//      transition is captured but no other fields change at this step.
//   5. Construct printUrl from WEB_APP_INTERNAL_URL + tenant.slug +
//      row.reportType + row.id following the locked
//      `/print-render/[tenantSlug]/[reportType]/[exportId]` template.
//   6. Call renderPdfViaService (relocated from apps/web to
//      packages/jobs/src/lib/ in this sub-batch — see 5.1c + 5.2a arc).
//      paperSize comes from the row; landscape is derived per report-
//      type (coverage = wide funder template per v2 §771, others = portrait).
//   7. SOLE store = MinIO (the exports bucket, via packages/storage
//      uploadObject). Telegram was ABANDONED as the report-export store on
//      2026-07-20: the Bot API getFile download cap is 20 MB and a
//      report_map export already measured 18.86 MB, so the store was about
//      to break. MinIO has no such cap — an oversized PDF is no longer a
//      failure mode, and the cap check is gone with it. The upload is
//      wrapped in the same bounded exponential-backoff withRetry as before,
//      because re-rendering a 120s PDF just to retry a transient storage
//      blip is exactly what that wrapper exists to prevent.
//      NOTE: lib/telegram-storage.ts is still used for ER photo assets and
//      /api/assets — it is untouched by this change; only report exports
//      moved off Telegram.
//   8. Update status=ready + filePath=<MinIO object key> +
//      telegramFileId=null + fileSizeBytes + completedAt.
//      The MinIO key lives in the pre-existing (previously always-null)
//      `filePath` column — a deliberate PM decision to avoid a migration.
//   9. Return RenderResult for BullMQ result storage (visible in the
//      dashboard + 5.3d admin UI surfaces fileSizeBytes from this).
//
// Purged-row tolerance (report exports are EPHEMERAL — generated on demand,
// downloaded from a dialog, swept within ~30 minutes):
//   - The row can vanish mid-render (the user closes the dialog, which purges
//     their rows, or the janitor sweeps). That is NORMAL, not an error, so:
//     the initial load uses findFirst and RETURNS EARLY on null rather than
//     throwing (throwing would burn three BullMQ retries and pollute the
//     failure metrics for expected behaviour); the status writes use
//     updateMany, which affects zero rows silently, instead of update, which
//     throws P2025 when the row is gone.
//   - If the row disappears between a SUCCESSFUL upload and the ready write
//     (updateMany count === 0), the object we just wrote is an orphan and is
//     deleted best-effort. The janitor is the backstop; cleaning up
//     immediately is cheap and correct.
//
// Error path:
//   - Render OR storage failure: re-throw to trigger BullMQ retry
//     (default: 3 attempts, exponential backoff starting at 5000ms per
//     queue-factory.ts). On the LAST attempt only (attemptsMade+1 ===
//     attempts), flip the row to status=failed + errorMessage +
//     completedAt before re-throwing. Intermediate retries leave the
//     row as status=rendering so the UI does not flicker through
//     failed → rendering → failed across retries. Render + storage share
//     the same try/catch — both failure modes follow identical retry
//     semantics.
//
// NO try/finally for queue lifecycle — base-worker.createWorker owns the
// connection. NO AuditLog write here — reportExport.create owns the
// EXPORT_REQUESTED audit log; downloads write EXPORT_DOWNLOAD in the
// Route Handler (apps/web/src/app/api/exports/reports/[id]/download).
// No user is present in this processor's context (sync-driven enqueues
// have no triggering user from the worker side).

import type { Job } from "bullmq";
import {
  platformPrisma,
  type ExtendedPrismaClient,
} from "@marine-guardian/db";
import type { PdfRenderJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import { renderPdfViaService } from "../lib/pdf-renderer-client";
import {
  assertBucketExists,
  buildExportKey,
  deleteObject,
  getExportsBucketName,
  uploadObject,
} from "@marine-guardian/storage";

/**
 * Worker process uses the unextended `platformPrisma` client — the helper
 * passes tenant-scoped queries explicitly, so the tenant-guard extension
 * is not needed at this boundary. Same cast pattern as 5.1c area-rederive
 * + 5.2b patrol-track-materialize.
 */
const prisma: ExtendedPrismaClient =
  platformPrisma as unknown as ExtendedPrismaClient;

export interface RenderResult {
  exportId: string;
  status: "ready" | "failed";
  /** MinIO object key of the stored PDF (also persisted to row.filePath). */
  filePath?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

/**
 * Bounded retry with exponential backoff — same shape as
 * scripts/archive-er-assets.ts withRetry. Rides out transient storage
 * blips (network / 5xx) without burning a full BullMQ attempt,
 * which would re-render the entire PDF (up to 120s) just to re-upload it.
 */
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
          `[pdf-render] retry ${String(attempt)}/${String(attempts - 1)} on ${label}: ${
            err instanceof Error ? err.message : String(err)
          } — waiting ${String(backoff)}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Reports that render in landscape orientation. Coverage Report is a wide
 * funder template per v2 PRODUCT.md §771. Per Area Report + ad-hoc filtered
 * exports render in portrait. List is kept local to the processor (not
 * exported) because it is a render-time concern, not a spec-level decision —
 * any future per-tenant override would belong in the row's paramsJson.
 */
// report_map went PORTRAIT (owner 2026-07-12) — its @page CSS is portrait for the
// chart/map pages, so the Chromium viewport must be portrait-shaped too (Leaflet
// tiles to the viewport width). `coverage` stays landscape.
const LANDSCAPE_REPORT_TYPES: ReadonlySet<string> = new Set(["coverage"]);

function isLastAttempt(job: Job<PdfRenderJobPayload>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

export async function processPdfRender(
  job: Job<PdfRenderJobPayload>,
): Promise<RenderResult> {
  validateTenantContext(job.data);

  const { exportId, tenantId } = job.data;

  // Load the ReportExport row FIRST — before the WEB_APP_INTERNAL_URL guard
  // and before any render/upload work — so that ANY failure past this point
  // (a missing WEB_APP_INTERNAL_URL, an unresolvable tenant, or a
  // render/storage error) is caught below and flips this row to `failed`
  // instead of leaving it stuck at `queued` forever. Previously the
  // WEB_APP_INTERNAL_URL guard threw here BEFORE the row was ever touched
  // (and outside the try/catch), so a worker container missing that env var
  // left /exports spinning on a permanently `queued` row (owner report
  // 2026-07-06 — prod worker lacked WEB_APP_INTERNAL_URL).
  //
  // findFirst (not findFirstOrThrow): report exports are ephemeral and the row
  // can legitimately be purged before the worker picks the job up. That is
  // expected behaviour, not a failure — return early instead of throwing, so
  // BullMQ does not retry three times and the failure metrics stay meaningful.
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
      `[pdf-render] export ${exportId} (tenant ${tenantId}) no longer exists — purged before render started; skipping`,
    );
    return {
      exportId,
      status: "failed",
      errorMessage: "export row no longer exists (purged)",
    };
  }

  try {
    const baseUrl = process.env.WEB_APP_INTERNAL_URL;
    if (baseUrl === undefined || baseUrl === "") {
      throw new Error(
        "WEB_APP_INTERNAL_URL is not configured — pdf-render processor cannot construct printUrl",
      );
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: row.tenantId },
      select: { id: true, slug: true },
    });

    // updateMany, not update: the row may have been purged between the load
    // above and here. update() would throw P2025; updateMany silently affects
    // zero rows and the render simply proceeds (the ready write below detects
    // the purge and cleans up the orphaned object).
    await prisma.reportExport.updateMany({
      where: { id: row.id },
      // Clear any prior completion time / error when (re-)entering rendering — a
      // row that is actively rendering is NOT done, so it must never carry a
      // stale completedAt (which surfaced a "Completed" timestamp on a still-
      // rendering row; owner report 2026-07-05) or a leftover errorMessage.
      data: { status: "rendering", completedAt: null, errorMessage: null },
    });

    const printUrl = `${baseUrl}/print-render/${tenant.slug}/${row.reportType}/${row.id}`;
    const landscape = LANDSCAPE_REPORT_TYPES.has(row.reportType);

    const pdfBuffer = await renderPdfViaService({
      printUrl,
      paperSize: row.paperSize,
      landscape,
      exportId: row.id,
    });

    const fileSizeBytes = pdfBuffer.length;

    // SOLE store = MinIO exports bucket. No size cap applies (that was a
    // Telegram Bot API getFile constraint, and Telegram is no longer used
    // for report exports).
    const bucket = getExportsBucketName();
    await assertBucketExists(bucket);
    const key = buildExportKey(row.tenantId, row.id, new Date());

    await withRetry("minio putObject", () =>
      uploadObject({
        bucket,
        key,
        body: pdfBuffer,
        contentType: "application/pdf",
      }),
    );

    const readyWrite = await prisma.reportExport.updateMany({
      where: { id: row.id },
      data: {
        status: "ready",
        filePath: key,
        telegramFileId: null,
        fileSizeBytes,
        completedAt: new Date(),
      },
    });

    if (readyWrite.count === 0) {
      // The row was purged while we were rendering/uploading, so the object we
      // just wrote can never be reached through it — delete it now rather than
      // leaving it for the janitor. Best-effort only: a cleanup failure must
      // never turn a successful render into a job failure.
      try {
        await deleteObject({ bucket, key });
      } catch (cleanupErr) {
        console.warn(
          `[pdf-render] orphan cleanup failed for ${key}: ${
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr)
          }`,
        );
      }
      console.info(
        `[pdf-render] export ${row.id} was purged mid-render — orphaned object ${key} removed`,
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
      // Only move a still-pending row (queued/rendering) → failed; never
      // clobber a terminal `ready` (defense-in-depth against a concurrent
      // success/retry racing this catch). The status filter in updateMany
      // makes the guard atomic — a row that already reached `ready`/`failed`
      // is left untouched.
      await prisma.reportExport.updateMany({
        where: { id: row.id, status: { in: ["queued", "rendering"] } },
        data: {
          status: "failed",
          errorMessage,
          completedAt: new Date(),
        },
      });
    }

    throw err;
  }
}
