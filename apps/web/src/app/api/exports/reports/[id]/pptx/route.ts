// Non-tRPC: manual auth required (security.md L11).
//
// Streams a finished ReportExport PowerPoint (.pptx) — the on-demand
// "Render to PowerPoint" companion to the PDF download route
// (apps/web/src/app/api/exports/reports/[id]/download/route.ts), which this
// file mirrors almost exactly. Differences only: reads the pptx* columns,
// derives its own object key (see below), and the audit action + content
// type are PPTX-specific.
//
// The store is MinIO (Phase 4 S4 — the ephemeral-exports migration). The
// pptx-render worker re-renders the report from source and PUTs the .pptx
// into the exports bucket. Telegram is NO LONGER involved in report exports
// (`pptxTelegramFileId` is always null on newly written rows).
//
//   tRPC reportExport.renderPptx → BullMQ pptx-render worker →
//   re-render from report data → MinIO putObject (sole store) →
//   row.pptxStatus=ready →
//   tRPC reportExport.getPptxDownloadUrl returns
//   `/api/exports/reports/{id}/pptx` →
//   THIS ROUTE HANDLER streams the object with a download Content-Disposition.
//
// DERIVED KEY — there is no pptx key column. Unlike the PDF (whose MinIO key
// is persisted in `ReportExport.filePath`), the .pptx key is NOT stored
// anywhere; every reader recomputes it with
// buildPptxExportKey(tenantId, exportId, at). This route recomputes with the
// current date, matching the worker, which derives the key at upload time.
// ⚠ Consequence: the key embeds a UTC year/month, so an upload at 23:59 UTC
// on the last day of a month and a download after midnight derive DIFFERENT
// prefixes and the object is not found (surfacing as the 410 below). Exports
// are ephemeral so the window is small, but persisting the key — as the PDF
// path already does — would remove the hazard entirely.
//
// Ephemerality — the 410 case. Report exports are deliberately short-lived:
// they are purged when the export dialog is closed and by a TTL janitor
// sweep, either of which can land WHILE a download is in flight:
//   - 404 → the ROW is missing, cross-tenant, or pptx not ready.
//   - 410 → the row is ready but the OBJECT is gone. Kept distinct from 404
//           on purpose — collapsing the two would make the deletion race
//           undiagnosable in production.
//   - 502 → an unexpected storage failure (getObjectBytes threw).
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
  buildPptxExportKey,
  getExportsBucketName,
  getObjectBytes,
} from "@marine-guardian/storage";
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
      pptxFileSizeBytes: true,
      reportType: true,
      completedAt: true,
    },
  });

  // 404 on missing OR cross-tenant. NEVER 403 — confirming existence to a
  // non-owning caller leaks tenant occupancy.
  if (row === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 404 on non-ready pptx rows. There is no key column to check here — the
  // key is derived below — so readiness is the only row-level gate.
  if (row.pptxStatus !== "ready") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Write the EXPORT_PPTX_DOWNLOAD AuditLog BEFORE streaming begins so a
  // network interruption mid-stream still leaves a record of who attempted
  // the download. L5 data-egress control.
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
  // PDF's completion time — good enough for a filename date stamp.
  const completedAt = row.completedAt ?? new Date();
  const filename = `${row.reportType}-${formatYmd(completedAt)}.pptx`;

  const headers = new Headers({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });

  // Derived key — no column exists. See the header note on the month-boundary
  // hazard this inherits from deriving rather than persisting.
  const key = buildPptxExportKey(row.tenantId, row.id, new Date());

  let bytes: Buffer | null;
  try {
    bytes = await getObjectBytes({
      bucket: getExportsBucketName(),
      key,
    });
  } catch (err) {
    console.error(
      `[exports/pptx] storage read failed for export ${row.id}:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "PowerPoint file temporarily unavailable" },
      { status: 502 },
    );
  }

  // 410 GONE — ready row, purged object. Distinct from 404 (no such row for
  // you) and from 502 (something actually broke).
  if (bytes === null) {
    return NextResponse.json(
      { error: "This report has expired. Generate it again." },
      { status: 410 },
    );
  }

  headers.set("Content-Length", String(bytes.byteLength));
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
