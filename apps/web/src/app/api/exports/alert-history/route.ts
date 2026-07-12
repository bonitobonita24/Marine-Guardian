// Non-tRPC: manual auth required (security.md L11).
// Route Handlers bypass tRPC middleware, so this file calls requireRouteAuth()
// directly and applies tenant scoping + rate limiting + audit logging by hand.
// AlertHistory is an immutable audit trail — the snapshot columns
// (ruleNameSnapshot, eventTitleSnapshot) are the source of truth for the row.

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
import {
  alertHistoryListFilters,
  EXCLUDE_SKYLIGHT_ALERTS,
} from "@/server/trpc/routers/alertHistory";

const ROW_CAP = 10_000;

interface AlertHistoryRow {
  id: string;
  ruleNameSnapshot: string;
  eventTitleSnapshot: string;
  matchedPriority: string;
  recipientCount: string;
  alertRuleCurrent: string;
  eventCurrent: string;
  firedAt: string;
}

const columnDefs: { key: keyof AlertHistoryRow; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "ruleNameSnapshot", label: "Rule (Snapshot)" },
  { key: "eventTitleSnapshot", label: "Event (Snapshot)" },
  { key: "matchedPriority", label: "Priority" },
  { key: "recipientCount", label: "Recipients" },
  { key: "alertRuleCurrent", label: "Rule (Current)" },
  { key: "eventCurrent", label: "Event (Current)" },
  { key: "firedAt", label: "Fired At" },
];

const csvColumns: CsvColumn<AlertHistoryRow>[] = columnDefs;
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

  const alertRuleIdParam = url.searchParams.get("alertRuleId");

  const parsed = alertHistoryListFilters.safeParse({
    alertRuleId: alertRuleIdParam ?? undefined,
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

  const items = await prisma.alertHistory.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters.alertRuleId !== undefined
        ? { alertRuleId: filters.alertRuleId }
        : {}),
      ...EXCLUDE_SKYLIGHT_ALERTS,
    },
    take: ROW_CAP + 1,
    orderBy: { firedAt: "desc" },
    include: {
      alertRule: { select: { id: true, name: true } },
      event: { select: { id: true, title: true, serialNumber: true, state: true } },
    },
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

  type AlertHistoryItem = (typeof items)[number];

  const rows: AlertHistoryRow[] = items.map((h: AlertHistoryItem) => ({
    id: h.id,
    ruleNameSnapshot: h.ruleNameSnapshot,
    eventTitleSnapshot: h.eventTitleSnapshot,
    matchedPriority: String(h.matchedPriority),
    recipientCount: String(h.recipientCount),
    alertRuleCurrent: h.alertRule?.name ?? "(deleted)",
    eventCurrent: h.event?.title ?? "(deleted)",
    firedAt: h.firedAt.toISOString(),
  }));

  const filterHash = hashFilters(filters);
  const filterSummary = summarizeFilters(filters);
  const filename = buildExportFilename("alert-history", tenant.slug, format);

  if (format === "csv") {
    const body = toCsv(rows, csvColumns);
    await writeExportAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entity: "alert-history",
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
    entity: "Alert History",
    tenantName: tenant.name,
    filterSummary,
    generatedAt: new Date(),
    columns: pdfColumns,
    rows: rows as unknown as Record<string, unknown>[],
  });

  await writeExportAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    entity: "alert-history",
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
