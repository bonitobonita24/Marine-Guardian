// Non-tRPC: manual auth required (security.md L11).
//
// Streams a finished ReportExport PDF from MinIO via @marine-guardian/storage.
// Phase 8 Batch 5 Sub-batch 5.3c — completes the consumer side of the
// pdf-render pipeline (v2 PRODUCT.md §505-506):
//
//   tRPC reportExport.create (5.3b) → BullMQ pdf-render worker (5.3b) →
//   Puppeteer service (5.3a) → MinIO upload (5.3c) → row.status=ready →
//   tRPC reportExport.getDownloadUrl returns `/api/exports/reports/{id}/download` →
//   THIS ROUTE HANDLER streams the file with a download Content-Disposition.
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
import { Readable } from "node:stream";
import { TRPCError } from "@trpc/server";

import { prisma } from "@marine-guardian/db";
import {
  getPdfReadStream,
  getExportsBucketName,
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
      status: true,
      filePath: true,
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
  if (row.status !== "ready" || row.filePath === null) {
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

  const bucket = getExportsBucketName();
  const nodeStream = await getPdfReadStream({ bucket, key: row.filePath });

  // Build a human-friendly download filename. completedAt is non-null for
  // any ready row (processor sets it alongside status=ready).
  const completedAt = row.completedAt ?? new Date();
  const filename = `${row.reportType}-${formatYmd(completedAt)}.pdf`;

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  if (row.fileSizeBytes !== null) {
    headers.set("Content-Length", String(row.fileSizeBytes));
  }

  // Node Readable → Web ReadableStream conversion is required for the Fetch
  // Response body. Available since Node 18 / supported on Vercel Functions
  // and any Node 20+ runtime (we run Node 22 per project .nvmrc).
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, { status: 200, headers });
}
