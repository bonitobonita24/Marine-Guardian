// Non-tRPC: manual auth required (security.md L11).
// Route Handlers bypass tRPC middleware, so this file calls requireRouteAuth()
// directly and applies tenant scoping + rate limiting + audit logging by hand.

import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";

import { prisma } from "@marine-guardian/db";
import {
  requireRouteAuth,
  RouteAuthError,
} from "@/server/lib/route-auth";
import { rateLimiters } from "@/server/lib/rate-limit";
import { toCsv, type CsvColumn } from "@/server/lib/export-csv";
import {
  renderExportPdf,
  type PdfColumn,
} from "@/server/lib/export-pdf";
import { writeExportAudit } from "@/server/lib/export-audit";
import { buildExportFilename } from "@/server/lib/export-filename";
import { patrolListFilters } from "@/server/trpc/routers/patrol";

const ROW_CAP = 10_000;

interface PatrolRow {
  id: string;
  serialNumber: string;
  title: string;
  patrolType: string;
  state: string;
  boatName: string;
  startTime: string;
  endTime: string;
  totalDistanceKm: string;
  createdAt: string;
}

const columnDefs: { key: keyof PatrolRow; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "serialNumber", label: "Serial" },
  { key: "title", label: "Title" },
  { key: "patrolType", label: "Patrol Type" },
  { key: "state", label: "State" },
  { key: "boatName", label: "Boat" },
  { key: "startTime", label: "Start Time" },
  { key: "endTime", label: "End Time" },
  { key: "totalDistanceKm", label: "Distance (km)" },
  { key: "createdAt", label: "Created At" },
];

const csvColumns: CsvColumn<PatrolRow>[] = columnDefs;
const pdfColumns: PdfColumn[] = columnDefs.map((c) => ({
  key: c.key,
  label: c.label,
}));

function summarizeFilters(
  filters: Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === "") continue;
    parts.push(`${k}=${JSON.stringify(v)}`);
  }
  return parts.length > 0 ? parts.join(", ") : "(none)";
}

function hashFilters(filters: Record<string, unknown>): string {
  const sortedKeys = Object.keys(filters).sort();
  const normalized: Record<string, unknown> = {};
  for (const k of sortedKeys) normalized[k] = filters[k];
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";

  const stateParam = url.searchParams.get("state");
  const patrolTypeParam = url.searchParams.get("patrolType");

  const parsed = patrolListFilters.safeParse({
    state: stateParam ?? undefined,
    patrolType: patrolTypeParam ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid filter parameters" },
      { status: 400 },
    );
  }
  const filters = parsed.data;

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.tenantId },
    select: { slug: true, name: true },
  });

  const items = await prisma.patrol.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters.state !== undefined ? { state: filters.state } : {}),
      ...(filters.patrolType !== undefined
        ? { patrolType: filters.patrolType }
        : {}),
    },
    take: ROW_CAP + 1,
    orderBy: { createdAt: "desc" },
  });

  if (items.length > ROW_CAP) {
    return NextResponse.json(
      {
        error: "Result set too large, narrow filters and try again",
        rowsRequested: items.length,
        limit: ROW_CAP,
      },
      { status: 413 },
    );
  }

  const rows: PatrolRow[] = items.map((p) => ({
    id: p.id,
    serialNumber: p.serialNumber ?? "",
    title: p.title ?? "",
    patrolType: p.patrolType,
    state: p.state,
    boatName: p.boatName ?? "",
    startTime: p.startTime !== null ? p.startTime.toISOString() : "",
    endTime: p.endTime !== null ? p.endTime.toISOString() : "",
    totalDistanceKm:
      p.totalDistanceKm !== null ? String(p.totalDistanceKm) : "",
    createdAt: p.createdAt.toISOString(),
  }));

  const filterHash = hashFilters(filters);
  const filterSummary = summarizeFilters(filters);
  const filename = buildExportFilename("patrols", tenant.slug, format);

  if (format === "csv") {
    const body = toCsv(rows, csvColumns);
    await writeExportAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entity: "patrols",
      format: "csv",
      filterHash,
      rowCount: rows.length,
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdfBuffer = await renderExportPdf({
    entity: "Patrols",
    tenantName: tenant.name,
    filterSummary,
    generatedAt: new Date(),
    columns: pdfColumns,
    rows: rows as unknown as Record<string, unknown>[],
  });

  await writeExportAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    entity: "patrols",
    format: "pdf",
    filterHash,
    rowCount: rows.length,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
