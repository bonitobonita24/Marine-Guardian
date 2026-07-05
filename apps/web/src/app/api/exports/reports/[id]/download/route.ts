// Non-tRPC: manual auth required (security.md L11).
//
// Streams a finished ReportExport PDF. Phase 8 Batch 5 Sub-batch 5.3c
// completed the consumer side of the pdf-render pipeline (v2 PRODUCT.md
// §505-506); Phase 4 S2 made Telegram the STRICT-ONLY store — there is no
// server-side/MinIO copy at any point:
//
//   tRPC reportExport.create (5.3b) → BullMQ pdf-render worker (5.3b) →
//   Puppeteer service (5.3a) → Telegram sendDocument (sole store) →
//   row.status=ready →
//   tRPC reportExport.getDownloadUrl returns `/api/exports/reports/{id}/download` →
//   THIS ROUTE HANDLER streams the file with a download Content-Disposition.
//
// Telegram-only read: every ready row is fetched from Telegram via
// fetchTelegramFileBytes (bounded 429 retry inside). Any Telegram failure
// (down, rate-limited beyond retries, >20MB getFile cap) becomes a clean
// 502 — same posture as /api/assets/[id]. telegramFileId is NEVER exposed
// to the client; it only selects the server-side fetch path. Legacy rows
// written before this contract (telegramFileId null) now 404 — there is
// no MinIO fallback path.
//
// Security posture (per security.md):
//   - Manual auth via requireRouteAuth (tRPC bypassed — no middleware chain).
//   - Tenant scope enforced server-side via session.tenantId. URL contains
//     no tenantId; the row lookup is `id + tenantId` so cross-tenant access
//     is impossible at the data layer. Returns 404 (not 403) on miss —
//     never confirms cross-tenant existence (security.md "production error
//     handling" rules).
//   - Status check rejects non-ready rows with 404 (do not leak in-progress
//     state to non-owning callers — the owner uses the tRPC pollStatus path).
//   - EXPORT_DOWNLOAD AuditLog written before streaming begins (L5 audit
//     of every data egress).
//   - Rate-limited via the `upload` tier (file-streaming endpoint).

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
      status: true,
      telegramFileId: true,
      fileSizeBytes: true,
      reportType: true,
      completedAt: true,
    },
  });

  // 404 on missing OR cross-tenant. NEVER 403 — confirming existence to a
  // non-owning caller leaks tenant occupancy.
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 404 on non-ready rows. Owning caller polls status via the tRPC
  // pollStatus endpoint; this download path is strictly for finished PDFs.
  // A ready row must carry a telegramFileId — Telegram is the sole store,
  // so a row without one (e.g. a legacy pre-Telegram-only row) has no
  // retrievable file.
  if (row.status !== "ready" || row.telegramFileId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Write the EXPORT_DOWNLOAD AuditLog BEFORE streaming begins so a network
  // interruption mid-stream still leaves a record of who attempted the
  // download. Action name parallels EXPORT_REQUESTED written by
  // reportExport.create (5.3b).
  await prisma.auditLog.create({
    data: {
      action: "EXPORT_DOWNLOAD",
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entityType: "ReportExport",
      entityId: row.id,
      changesJson: {
        reportType: row.reportType,
        fileSizeBytes: row.fileSizeBytes,
      },
    },
  });

  // Build a human-friendly download filename. completedAt is non-null for
  // any ready row (processor sets it alongside status=ready).
  const completedAt = row.completedAt ?? new Date();
  const filename = `${row.reportType}-${formatYmd(completedAt)}.pdf`;

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });

  // Telegram-only read: the ready-row gate above guarantees telegramFileId
  // is non-null here. Any failure (token unset, Telegram down, 429 beyond
  // retries, >20MB getFile cap) maps to a clean 502 — never an unhandled
  // 500, and never a fall-through to a server-side copy (there isn't one).
  let bytes: ArrayBuffer;
  try {
    const botToken = getTelegramBotToken();
    ({ bytes } = await fetchTelegramFileBytes({
      botToken,
      fileId: row.telegramFileId,
    }));
  } catch (err) {
    console.error(
      `[exports/download] Telegram fetch failed for export ${row.id}:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Report file temporarily unavailable" },
      { status: 502 },
    );
  }
  headers.set("Content-Length", String(bytes.byteLength));
  return new Response(bytes, { status: 200, headers });
}
