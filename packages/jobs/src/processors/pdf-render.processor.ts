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
//   7. SOLE store = Telegram (reuses the ER photo-archive channel):
//      sendDocument to chatId = tenant.telegramChannelId ??
//      TELEGRAM_DEFAULT_CHANNEL_ID via lib/telegram-storage.
//      uploadDocumentToTelegram, wrapped in the same bounded
//      exponential-backoff retry scripts/archive-er-assets.ts uses.
//      row.telegramFileId stores the returned file_id. There is NO
//      server-side/MinIO copy of the PDF at any point — row.filePath is
//      always persisted as null for new exports.
//      When Telegram is NOT configured (missing TELEGRAM_BOT_TOKEN or no
//      channel for the tenant) OR the PDF exceeds Telegram's 20 MB getFile
//      download cap, the job FAILS CLEANLY (throws — no silent server-side
//      fallback write). The thrown error follows the same retry semantics
//      as a render/upload failure below: re-thrown on transient attempts,
//      flips status=failed with errorMessage on the last attempt.
//   8. Update status=ready + telegramFileId + filePath=null +
//      fileSizeBytes + completedAt.
//   9. Return RenderResult for BullMQ result storage (visible in the
//      dashboard + 5.3d admin UI surfaces fileSizeBytes from this).
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
import { uploadDocumentToTelegram } from "../lib/telegram-storage";

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
  telegramFileId?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

/**
 * Telegram bot getFile downloads are capped at 20 MB. A PDF above the cap
 * would upload fine (sendDocument allows 50 MB) but be permanently
 * undownloadable through the Bot API — so a render this large fails the
 * job cleanly rather than being stored somewhere undownloadable.
 */
const TELEGRAM_GETFILE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Bounded retry with exponential backoff — same shape as
 * scripts/archive-er-assets.ts withRetry. Rides out transient Telegram
 * blips (network / rate-limit) without burning a full BullMQ attempt,
 * which would re-render the entire PDF (up to 120s) just to resend it.
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
 * Resolve the Telegram destination for a tenant's report exports, or null
 * when Telegram storage is not configured for this environment/tenant
 * (missing TELEGRAM_BOT_TOKEN, or neither tenant.telegramChannelId nor
 * TELEGRAM_DEFAULT_CHANNEL_ID set) — same env posture as ER photo archiving.
 */
function resolveTelegramTarget(tenant: {
  telegramChannelId: string | null;
}): { botToken: string; chatId: string } | null {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (token === undefined || token.trim() === "") return null;
  const chatId =
    tenant.telegramChannelId ?? process.env["TELEGRAM_DEFAULT_CHANNEL_ID"];
  if (chatId === undefined || chatId.trim() === "") {
    return null;
  }
  return { botToken: token.trim(), chatId: chatId.trim() };
}

/**
 * Reports that render in landscape orientation. Coverage Report is a wide
 * funder template per v2 PRODUCT.md §771. Per Area Report + ad-hoc filtered
 * exports render in portrait. List is kept local to the processor (not
 * exported) because it is a render-time concern, not a spec-level decision —
 * any future per-tenant override would belong in the row's paramsJson.
 */
const LANDSCAPE_REPORT_TYPES: ReadonlySet<string> = new Set(["coverage", "report_map"]);

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

  try {
    const baseUrl = process.env.WEB_APP_INTERNAL_URL;
    if (baseUrl === undefined || baseUrl === "") {
      throw new Error(
        "WEB_APP_INTERNAL_URL is not configured — pdf-render processor cannot construct printUrl",
      );
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: row.tenantId },
      select: { id: true, slug: true, telegramChannelId: true },
    });

    await prisma.reportExport.update({
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

    // SOLE store = Telegram (per-tenant channel, same as ER photo
    // archiving). There is no server-side/MinIO copy at any point — a
    // Telegram destination that is unconfigured, or a PDF too large for
    // Telegram's getFile cap, fails the job cleanly instead of degrading
    // to a local write.
    const target = resolveTelegramTarget(tenant);
    if (target === null) {
      throw new Error(
        "Telegram not configured for tenant — set TELEGRAM_BOT_TOKEN plus tenant.telegramChannelId or TELEGRAM_DEFAULT_CHANNEL_ID",
      );
    }
    if (fileSizeBytes > TELEGRAM_GETFILE_MAX_BYTES) {
      throw new Error(
        `PDF exceeds Telegram's 20 MB getFile limit (rendered ${String(fileSizeBytes)} bytes) — cannot store this export`,
      );
    }

    const uploaded = await withRetry("telegram sendDocument", () =>
      uploadDocumentToTelegram({
        botToken: target.botToken,
        chatId: target.chatId,
        // Copy into a fresh Uint8Array<ArrayBuffer> — Buffer is typed over
        // ArrayBufferLike and does not satisfy the Blob ctor constraint.
        bytes: new Uint8Array(pdfBuffer),
        filename: `${row.reportType}-${row.id}.pdf`,
        mimeType: "application/pdf",
        caption: `Report export ${row.reportType} — ${tenant.slug}`,
      }),
    );
    if (uploaded.fileId === "") {
      throw new Error(
        "Telegram sendDocument returned no document file_id for report PDF",
      );
    }
    const telegramFileId = uploaded.fileId;

    await prisma.reportExport.update({
      where: { id: row.id },
      data: {
        status: "ready",
        telegramFileId,
        filePath: null,
        fileSizeBytes,
        completedAt: new Date(),
      },
    });

    return {
      exportId: row.id,
      status: "ready",
      telegramFileId,
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
