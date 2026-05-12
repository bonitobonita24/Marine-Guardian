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
import { alertRuleListFilters } from "@/server/trpc/routers/alertRule";

const ROW_CAP = 10_000;

interface AlertRuleRow {
  id: string;
  name: string;
  condition: string;
  channels: string;
  isActive: string;
  creatorName: string;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
}

const columnDefs: { key: keyof AlertRuleRow; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "condition", label: "Condition" },
  { key: "channels", label: "Channels" },
  { key: "isActive", label: "Active" },
  { key: "creatorName", label: "Created By" },
  { key: "creatorId", label: "Creator ID" },
  { key: "createdAt", label: "Created At" },
  { key: "updatedAt", label: "Updated At" },
];

const csvColumns: CsvColumn<AlertRuleRow>[] = columnDefs;
const pdfColumns: PdfColumn[] = columnDefs.map((c) => ({
  key: c.key,
  label: c.label,
}));

function summarizeFilters(
  filters: Record<string, string | number | boolean | undefined>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === "") continue;
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

  // Coerce query-string isActive into a real boolean for the Zod schema.
  // tRPC clients pass real booleans; the Route Handler accepts string form.
  const isActiveParam = url.searchParams.get("isActive");
  const isActiveBool =
    isActiveParam === "true"
      ? true
      : isActiveParam === "false"
        ? false
        : undefined;

  const parsed = alertRuleListFilters.safeParse({ isActive: isActiveBool });
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

  const items = await prisma.alertRule.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    take: ROW_CAP + 1,
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { id: true, fullName: true } } },
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

  type AlertRuleItem = (typeof items)[number];

  const rows: AlertRuleRow[] = items.map((r: AlertRuleItem) => ({
    id: r.id,
    name: r.name,
    condition: JSON.stringify(r.conditionJson),
    channels: r.notificationChannels.join(", "),
    isActive: r.isActive ? "true" : "false",
    creatorName: r.creator.fullName,
    creatorId: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const filterHash = hashFilters(filters);
  const filterSummary = summarizeFilters(filters);
  const filename = buildExportFilename("alert-rules", tenant.slug, format);

  if (format === "csv") {
    const body = toCsv(rows, csvColumns);
    await writeExportAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entity: "alert-rules",
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
    entity: "Alert Rules",
    tenantName: tenant.name,
    filterSummary,
    generatedAt: new Date(),
    columns: pdfColumns,
    rows: rows as unknown as Record<string, unknown>[],
  });

  await writeExportAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    entity: "alert-rules",
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
