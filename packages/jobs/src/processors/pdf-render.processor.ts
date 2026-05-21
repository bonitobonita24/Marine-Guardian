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
//   7. STUB the storage upload — 5.3b returns a deterministic file path
//      shaped per spec without writing to MinIO. Real MinIO upload lands
//      in 5.3c (packages/storage surface + replace this stub with the
//      real uploadPdf call).
//   8. Update status=ready + filePath + fileSizeBytes + completedAt.
//   9. Return RenderResult for BullMQ result storage (visible in the
//      dashboard + 5.3d admin UI surfaces fileSizeBytes from this).
//
// Error path:
//   - Render or storage failure: re-throw to trigger BullMQ retry
//     (default: 3 attempts, exponential backoff starting at 5000ms per
//     queue-factory.ts). On the LAST attempt only (attemptsMade+1 ===
//     attempts), flip the row to status=failed + errorMessage +
//     completedAt before re-throwing. Intermediate retries leave the
//     row as status=rendering so the UI does not flicker through
//     failed → rendering → failed across retries.
//
// NO try/finally for queue lifecycle — base-worker.createWorker owns the
// connection. NO AuditLog write here — reportExport.create owns the
// EXPORT_REQUESTED audit log; downloads write EXPORT_DOWNLOAD in 5.3c's
// Route Handler. No user is present in this processor's context (sync-
// driven enqueues have no triggering user from the worker side).

import type { Job } from "bullmq";
import {
  platformPrisma,
  type ExtendedPrismaClient,
} from "@marine-guardian/db";
import type { PdfRenderJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import { renderPdfViaService } from "../lib/pdf-renderer-client";

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
  filePath?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

/**
 * Reports that render in landscape orientation. Coverage Report is a wide
 * funder template per v2 PRODUCT.md §771. Per Area Report + ad-hoc filtered
 * exports render in portrait. List is kept local to the processor (not
 * exported) because it is a render-time concern, not a spec-level decision —
 * any future per-tenant override would belong in the row's paramsJson.
 */
const LANDSCAPE_REPORT_TYPES: ReadonlySet<string> = new Set(["coverage"]);

function deriveAppEnv(): string {
  const env = process.env.APP_ENV;
  if (env === undefined || env === "") {
    return "dev";
  }
  return env;
}

function buildStorageFilePath(
  tenantId: string,
  exportId: string,
  now: Date,
): string {
  const env = deriveAppEnv();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `marine-guardian-${env}-exports/${tenantId}/${year}/${month}/${exportId}.pdf`;
}

function isLastAttempt(job: Job<PdfRenderJobPayload>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

export async function processPdfRender(
  job: Job<PdfRenderJobPayload>,
): Promise<RenderResult> {
  validateTenantContext(job.data);

  const baseUrl = process.env.WEB_APP_INTERNAL_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new Error(
      "WEB_APP_INTERNAL_URL is not configured — pdf-render processor cannot construct printUrl",
    );
  }

  const { exportId, tenantId } = job.data;

  const row = await prisma.reportExport.findFirstOrThrow({
    where: { id: exportId, tenantId },
    select: {
      id: true,
      tenantId: true,
      reportType: true,
      paperSize: true,
      status: true,
    },
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: row.tenantId },
    select: { id: true, slug: true },
  });

  await prisma.reportExport.update({
    where: { id: row.id },
    data: { status: "rendering" },
  });

  const printUrl = `${baseUrl}/print-render/${tenant.slug}/${row.reportType}/${row.id}`;
  const landscape = LANDSCAPE_REPORT_TYPES.has(row.reportType);

  try {
    const pdfBuffer = await renderPdfViaService({
      printUrl,
      paperSize: row.paperSize,
      landscape,
      exportId: row.id,
    });

    // 5.3b STUB — real MinIO write lands in 5.3c. The deterministic path
    // matches the eventual bucket key so the row's filePath is stable
    // across the storage swap.
    const filePath = buildStorageFilePath(row.tenantId, row.id, new Date());
    const fileSizeBytes = pdfBuffer.length;

    await prisma.reportExport.update({
      where: { id: row.id },
      data: {
        status: "ready",
        filePath,
        fileSizeBytes,
        completedAt: new Date(),
      },
    });

    return {
      exportId: row.id,
      status: "ready",
      filePath,
      fileSizeBytes,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (isLastAttempt(job)) {
      await prisma.reportExport.update({
        where: { id: row.id },
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
