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
import { eventListFilters } from "@/server/trpc/routers/event";

const ROW_CAP = 10_000;

interface EventRow {
  id: string;
  serialNumber: string;
  title: string;
  state: string;
  priority: number;
  eventType: string;
  category: string;
  reportedByName: string;
  reportedAt: string;
  createdAt: string;
}

const columnDefs: { key: keyof EventRow; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "serialNumber", label: "Serial" },
  { key: "title", label: "Title" },
  { key: "state", label: "State" },
  { key: "priority", label: "Priority" },
  { key: "eventType", label: "Event Type" },
  { key: "category", label: "Category" },
  { key: "reportedByName", label: "Reported By" },
  { key: "reportedAt", label: "Reported At" },
  { key: "createdAt", label: "Created At" },
];

const csvColumns: CsvColumn<EventRow>[] = columnDefs;
const pdfColumns: PdfColumn[] = columnDefs.map((c) => ({
  key: c.key,
  label: c.label,
}));

function summarizeFilters(
  // `string[]` accommodates the shared eventListFilters' array-valued members
  // (e.g. `typeDisplays`, the Events-list subcategory multi-select). This route
  // never populates them — it only reads state/priority/category/areaName/
  // dateFrom/dateTo off the query string — but they are part of the shared
  // schema's inferred type. Arrays stringify as "a,b", which is fine for an
  // audit summary line.
  filters: Record<string, string | number | boolean | string[] | undefined>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      parts.push(`${k}=${v.join(",")}`);
      continue;
    }
    parts.push(`${k}=${String(v)}`);
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

  const stateParam    = url.searchParams.get("state");
  const priorityParam = url.searchParams.get("priority");
  const categoryParam = url.searchParams.get("category");
  const areaNameParam = url.searchParams.get("areaName");
  const dateFromParam = url.searchParams.get("dateFrom");
  const dateToParam   = url.searchParams.get("dateTo");

  const parsed = eventListFilters.safeParse({
    state:    stateParam    ?? undefined,
    priority: priorityParam !== null ? Number(priorityParam) : undefined,
    category: categoryParam ?? undefined,
    areaName: areaNameParam ?? undefined,
    dateFrom: dateFromParam ?? undefined,
    dateTo:   dateToParam   ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid filter parameters" },
      { status: 400 },
    );
  }
  const filters = parsed.data;

  const dateFromParsed = filters.dateFrom !== undefined ? new Date(filters.dateFrom) : undefined;
  const dateToParsed   = filters.dateTo   !== undefined ? new Date(filters.dateTo)   : undefined;

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.tenantId },
    select: { slug: true, name: true },
  });

  const items = await prisma.event.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters.state    !== undefined ? { state:    filters.state    } : {}),
      ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
      ...(filters.category !== undefined
        ? { eventType: { category: { equals: filters.category, mode: "insensitive" } } }
        : {}),
      ...(filters.areaName !== undefined
        ? { areaName: { contains: filters.areaName, mode: "insensitive" } }
        : {}),
      ...(dateFromParsed !== undefined || dateToParsed !== undefined
        ? {
            reportedAt: {
              ...(dateFromParsed !== undefined ? { gte: dateFromParsed } : {}),
              ...(dateToParsed   !== undefined ? { lte: dateToParsed   } : {}),
            },
          }
        : {}),
    },
    take: ROW_CAP + 1,
    orderBy: { createdAt: "desc" },
    include: { eventType: { select: { display: true, category: true } } },
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

  const rows: EventRow[] = items.map((e) => ({
    id: e.id,
    serialNumber: e.serialNumber ?? "",
    title: e.title ?? "",
    state: e.state,
    priority: e.priority,
    eventType: e.eventType?.display ?? "",
    category: e.eventType?.category ?? "",
    reportedByName: e.reportedByName ?? "",
    reportedAt: e.reportedAt !== null ? e.reportedAt.toISOString() : "",
    createdAt: e.createdAt.toISOString(),
  }));

  const filterHash = hashFilters(filters);
  const filterSummary = summarizeFilters(filters);
  const filename = buildExportFilename("events", tenant.slug, format);

  if (format === "csv") {
    const body = toCsv(rows, csvColumns);
    await writeExportAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entity: "events",
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
    entity: "Events",
    tenantName: tenant.name,
    filterSummary,
    generatedAt: new Date(),
    columns: pdfColumns,
    rows: rows as unknown as Record<string, unknown>[],
  });

  await writeExportAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    entity: "events",
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
