// Non-tRPC: manual auth required (security.md L11).
//
// Streams a finished ReportExport PowerPoint (.pptx) — the on-demand
// "Render to PowerPoint" companion to the PDF download route
// (apps/web/src/app/api/exports/reports/[id]/download/route.ts), which
// this file mirrors almost exactly. Differences only: reads the pptx*
// columns instead of the PDF columns, and the audit action + content type
// are PPTX-specific.
//
//   tRPC reportExport.renderPptx → BullMQ pptx-render worker →
//   pdf-to-pptx (rasterize + pptxgenjs) → Telegram sendDocument (sole
//   store) → row.pptxStatus=ready →
//   tRPC reportExport.getPptxDownloadUrl returns
//   `/api/exports/reports/{id}/pptx` →
//   THIS ROUTE HANDLER streams the file with a download Content-Disposition.
//
// Telegram-only read: every ready row is fetched from Telegram via
// fetchTelegramFileBytes (bounded 429 retry inside). Any Telegram failure
// (down, rate-limited beyond retries, >20MB getFile cap) becomes a clean
// 502. pptxTelegramFileId is NEVER exposed to the client; it only selects
// the server-side fetch path.
//
// Security posture (per security.md) — identical to the PDF download route:
//   - Manual auth via requireRouteAuth (tRPC bypassed — no middleware chain).
//   - Tenant scope enforced server-side via session.tenantId. URL contains
//     no tenantId; the row lookup is `id + tenantId` so cross-tenant access
//     is impossible at the data layer. Returns 404 (not 403) on miss —
//     never confirms cross-tenant existence.
//   - pptxStatus check rejects non-ready rows with 404 — the owner uses the
//     tRPC pollPptxStatus path to see in-progress state.
//   - EXPORT_PPTX_DOWNLOAD AuditLog written before streaming begins (L5
//     audit of every data egress).
//   - Rate-limited via the `upload` tier (file-streaming endpoint), same
//     as the PDF download route.

import { type NextRequest, NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";

import { prisma } from "@marine-guardian/db";
import {
  getTelegramBotToken,
  fetchTelegramFileBytes,
} from "@marine-guardian/jobs/lib/telegram-storage";
import {
  requireRouteAuth,
  RouteAuthError,
} from "@/server/lib/route-auth";
import { rateLimiters } from "@/server/lib/rate-limit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function formatYmd(d: Date): string {
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  let ctx;
  try {
    ctx = await requireRouteAuth();
  } catch (e) {
    if (e instanceof RouteAuthError) return e.response;
    throw e;
  }

  try {
    rateLimiters.upload.check(ctx.userId);
  } catch (e) {
    if (e instanceof TRPCError && e.code === "TOO_MANY_REQUESTS") {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 },
      );
    }
    throw e;
  }

  const { id } = await params;

  const row = await prisma.reportExport.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      tenantId: true,
      pptxStatus: true,
      pptxTelegramFileId: true,
      pptxFileSizeBytes: true,
      reportType: true,
      completedAt: true,
    },
  });

  // 404 on missing OR cross-tenant. NEVER 403 — confirming existence to a
  // non-owning caller leaks tenant occupancy.
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 404 on non-ready pptx rows. A ready row must carry a
  // pptxTelegramFileId — Telegram is the sole store.
  if (row.pptxStatus !== "ready" || row.pptxTelegramFileId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Write the EXPORT_PPTX_DOWNLOAD AuditLog BEFORE streaming begins so a
  // network interruption mid-stream still leaves a record of who
  // attempted the download.
  await prisma.auditLog.create({
    data: {
      action: "EXPORT_PPTX_DOWNLOAD",
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entityType: "ReportExport",
      entityId: row.id,
      changesJson: {
        reportType: row.reportType,
        fileSizeBytes: row.pptxFileSizeBytes,
      },
    },
  });

  // Build a human-friendly download filename. completedAt reflects the
  // PDF's completion time (the pptx render always happens after the PDF
  // is ready) — good enough for a filename date stamp.
  const completedAt = row.completedAt ?? new Date();
  const filename = `${row.reportType}-${formatYmd(completedAt)}.pptx`;

  const headers = new Headers({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });

  // Telegram-only read: the ready-row gate above guarantees
  // pptxTelegramFileId is non-null here. Any failure (token unset,
  // Telegram down, 429 beyond retries, >20MB getFile cap) maps to a clean
  // 502 — never an unhandled 500, and never a fall-through to a
  // server-side copy (there isn't one).
  let bytes: ArrayBuffer;
  try {
    const botToken = getTelegramBotToken();
    ({ bytes } = await fetchTelegramFileBytes({
      botToken,
      fileId: row.pptxTelegramFileId,
    }));
  } catch (err) {
    console.error(
      `[exports/pptx] Telegram fetch failed for export ${row.id}:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "PowerPoint file temporarily unavailable" },
      { status: 502 },
    );
  }
  headers.set("Content-Length", String(bytes.byteLength));
  return new Response(bytes, { status: 200, headers });
}
