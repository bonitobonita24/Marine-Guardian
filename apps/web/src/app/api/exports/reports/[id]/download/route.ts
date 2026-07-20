// Non-tRPC: manual auth required (security.md L11).
//
// Streams a finished ReportExport PDF. The store is MinIO (Phase 4 S4 —
// the ephemeral-exports migration): the pdf-render worker PUTs the rendered
// PDF into the exports bucket and writes the object key into
// `ReportExport.filePath`. Telegram is NO LONGER involved in report exports
// (`telegramFileId` is always null on newly written rows); the Telegram
// helper module remains live only for ER photo assets served by /api/assets.
//
//   tRPC reportExport.create → BullMQ pdf-render worker →
//   Puppeteer service → MinIO putObject (sole store) →
//   row.status=ready, row.filePath=<object key> →
//   tRPC reportExport.getDownloadUrl returns `/api/exports/reports/{id}/download` →
//   THIS ROUTE HANDLER streams the object with a download Content-Disposition.
//
// Ephemerality — the 410 case. Report exports are deliberately short-lived:
// they are purged when the export dialog is closed and by a TTL janitor
// sweep, either of which can land WHILE a download is in flight. So a ready
// row whose object has already been swept is a normal, expected outcome and
// gets its own status:
//   - 404 → the ROW is missing, cross-tenant, or not ready. Reserved for
//           "you have no business with this id".
//   - 410 → the row is ready but the OBJECT is gone (getObjectBytes returned
//           null). The file existed and was legitimately downloadable; it has
//           since been purged. Kept distinct from 404 on purpose — collapsing
//           the two would make the deletion race undiagnosable in production.
//   - 502 → an unexpected storage failure (getObjectBytes threw). A real bug
//           or an outage, never a benign purge.
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
  getExportsBucketName,
  getObjectBytes,
} from "@marine-guardian/storage";
import {
  requireRouteAuth,
  RouteAuthError,
} from "@/server/lib/route-auth";
import { rateLimiters } from "@/server/lib/rate-limit";
import { buildReportExportFilename } from "@/server/lib/report-export-filename";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  // `?disposition=inline` serves the same bytes for in-browser viewing
  // (Content-Disposition: inline) instead of forcing a download. This only
  // flips the header and the audit action; the byte source is identical.
  // Any other value (or absent) keeps the default attachment.
  const inline =
    _req.nextUrl.searchParams.get("disposition") === "inline";
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
      filePath: true,
      fileSizeBytes: true,
      reportType: true,
      paramsJson: true,
      completedAt: true,
    },
  });

  // 404 on missing OR cross-tenant. NEVER 403 — confirming existence to a
  // non-owning caller leaks tenant occupancy.
  if (row === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 404 on non-ready rows. Owning caller polls status via the tRPC
  // pollStatus endpoint; this download path is strictly for finished PDFs.
  // A ready row must carry a filePath (the MinIO object key) — a row without
  // one has no retrievable object at all, which is a different condition from
  // "the object was purged" (410) and is treated as not-found.
  if (row.status !== "ready" || row.filePath === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Write the EXPORT_DOWNLOAD AuditLog BEFORE streaming begins so a network
  // interruption mid-stream still leaves a record of who attempted the
  // download. Action name parallels EXPORT_REQUESTED written by
  // reportExport.create. This is an L5 data-egress control — it stays even
  // though generated reports carry no metadata table of their own.
  await prisma.auditLog.create({
    data: {
      action: inline ? "EXPORT_VIEW" : "EXPORT_DOWNLOAD",
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

  // Human-friendly download filename: scope + report type + date range
  // (see server/lib/report-export-filename.ts). A single Generate click can
  // now produce up to three files, so the name must distinguish them.
  const filename = await buildReportExportFilename(
    {
      tenantId: row.tenantId,
      reportType: row.reportType,
      paramsJson: row.paramsJson,
      completedAt: row.completedAt,
    },
    "pdf",
  );

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    "Cache-Control": "no-store",
  });

  // Read the object key straight off the row — never recompute it from
  // createdAt. The worker derives the key at UPLOAD time, so a row created
  // at 23:59 on the last day of a month lands under the NEXT month's prefix;
  // only the stored filePath is authoritative.
  let bytes: Buffer | null;
  try {
    bytes = await getObjectBytes({
      bucket: getExportsBucketName(),
      key: row.filePath,
    });
  } catch (err) {
    console.error(
      `[exports/download] storage read failed for export ${row.id}:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Report file temporarily unavailable" },
      { status: 502 },
    );
  }

  // 410 GONE — the row still says ready but the object has been swept
  // (dialog close or TTL janitor). Deliberately NOT a 404 (which means "no
  // such row for you") and NOT a 500 (nothing failed). The client shows the
  // regenerate prompt.
  if (bytes === null) {
    return NextResponse.json(
      { error: "This report has expired. Generate it again." },
      { status: 410 },
    );
  }

  headers.set("Content-Length", String(bytes.byteLength));
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
