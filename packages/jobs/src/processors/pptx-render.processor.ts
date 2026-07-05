// V-pptx-export — pptx-render processor.
//
// BullMQ job handler for the on-demand "Render to PowerPoint" feature on
// the /exports page. Converts an ALREADY-RENDERED report PDF into a .pptx
// (one slide per PDF page, each page rasterized to a full-bleed image).
// This is strictly ON-DEMAND — never enqueued automatically, never part of
// the normal report generation pipeline (reportExport.create / pdf-render).
//
// Pipeline:
//   1. Load the ReportExport row (id, tenantId) — defense-in-depth, same
//      posture as pdf-render.processor.
//   2. Require status="ready" AND telegramFileId non-null — the PDF must
//      already exist and be downloadable. Anything else fails cleanly (no
//      partial/garbage PPTX is ever produced from an unfinished PDF).
//   3. Fetch the PDF bytes from Telegram (fetchTelegramFileBytes — same
//      helper + bounded 429 retry as the download route).
//   4. Rasterize every page via pdfjs-dist (legacy Node build) + a
//      @napi-rs/canvas-backed canvas at scale=2.0 (~150 DPI equivalent for
//      a 72-DPI PDF page) → PNG bytes per page.
//   5. Build a .pptx via pptxgenjs: one custom-sized slide layout per
//      distinct page aspect ratio (a report is normally uniform paper size,
//      but nothing here assumes it), each page's PNG placed full-bleed via
//      addImage({ data: <base64 PNG>, x:0, y:0, w:'100%', h:'100%' }).
//   6. SOLE store = Telegram (same channel resolution as pdf-render):
//      uploadDocumentToTelegram, bounded exponential-backoff retry.
//      pptxTelegramFileId stores the returned file_id. There is NO
//      server-side/MinIO copy of the .pptx at any point.
//   7. Update pptxStatus=ready + pptxTelegramFileId + pptxFileSizeBytes.
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
import {
  getTelegramBotToken,
  fetchTelegramFileBytes,
  uploadDocumentToTelegram,
} from "../lib/telegram-storage";
import { renderPdfPagesToPptx } from "../lib/pdf-to-pptx";

const prisma: ExtendedPrismaClient =
  platformPrisma as unknown as ExtendedPrismaClient;

export interface PptxRenderResult {
  exportId: string;
  status: "ready" | "failed";
  telegramFileId?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

/**
 * Same Telegram getFile 20 MB download cap as pdf-render.processor — a
 * .pptx this large would upload fine (sendDocument allows 50 MB) but be
 * permanently undownloadable through the Bot API.
 */
const TELEGRAM_GETFILE_MAX_BYTES = 20 * 1024 * 1024;

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

function isLastAttempt(job: Job<PptxRenderJobPayload>): boolean {
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

export async function processPptxRender(
  job: Job<PptxRenderJobPayload>,
): Promise<PptxRenderResult> {
  validateTenantContext(job.data);

  const { exportId, tenantId } = job.data;

  const row = await prisma.reportExport.findFirstOrThrow({
    where: { id: exportId, tenantId },
    select: {
      id: true,
      tenantId: true,
      reportType: true,
      status: true,
      telegramFileId: true,
    },
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: row.tenantId },
    select: { id: true, slug: true, telegramChannelId: true },
  });

  await prisma.reportExport.update({
    where: { id: row.id },
    data: {
      pptxStatus: "rendering",
      pptxErrorMessage: null,
    },
  });

  try {
    // The source PDF must already be fully rendered and stored — PPTX
    // export never triggers or waits on a PDF render itself.
    if (row.status !== "ready" || row.telegramFileId === null) {
      throw new Error(
        "Source PDF is not ready — cannot render PowerPoint from an export that has not finished (or failed) PDF generation",
      );
    }

    const botToken = getTelegramBotToken();
    const { bytes: pdfBytes } = await fetchTelegramFileBytes({
      botToken,
      fileId: row.telegramFileId,
    });

    const pptxBuffer = await renderPdfPagesToPptx(
      new Uint8Array(pdfBytes),
    );

    const fileSizeBytes = pptxBuffer.length;

    const target = resolveTelegramTarget(tenant);
    if (target === null) {
      throw new Error(
        "Telegram not configured for tenant — set TELEGRAM_BOT_TOKEN plus tenant.telegramChannelId or TELEGRAM_DEFAULT_CHANNEL_ID",
      );
    }
    if (fileSizeBytes > TELEGRAM_GETFILE_MAX_BYTES) {
      throw new Error(
        `PPTX exceeds Telegram's 20 MB getFile limit (rendered ${String(fileSizeBytes)} bytes) — cannot store this export`,
      );
    }

    const uploaded = await withRetry("telegram sendDocument", () =>
      uploadDocumentToTelegram({
        botToken: target.botToken,
        chatId: target.chatId,
        bytes: new Uint8Array(pptxBuffer),
        filename: `${row.reportType}-${row.id}.pptx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        caption: `Report export ${row.reportType} — ${tenant.slug} (PowerPoint)`,
      }),
    );
    if (uploaded.fileId === "") {
      throw new Error(
        "Telegram sendDocument returned no document file_id for report PPTX",
      );
    }
    const telegramFileId = uploaded.fileId;

    await prisma.reportExport.update({
      where: { id: row.id },
      data: {
        pptxStatus: "ready",
        pptxTelegramFileId: telegramFileId,
        pptxFileSizeBytes: fileSizeBytes,
        pptxErrorMessage: null,
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
      await prisma.reportExport.update({
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
