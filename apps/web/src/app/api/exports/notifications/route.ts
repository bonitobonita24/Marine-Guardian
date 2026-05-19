// Non-tRPC: manual auth required (security.md L11).
// Route Handlers bypass tRPC middleware, so this file calls requireRouteAuth()
// directly and applies tenant + user scoping + rate limiting + audit logging by hand.
// Notifications are per-user, so the scope is (tenantId, userId) — not just tenantId.

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
import { notificationListFilters } from "@/server/trpc/routers/notification";

const ROW_CAP = 10_000;

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: string;
  alertRuleName: string;
  eventTitle: string;
  patrolTitle: string;
  createdAt: string;
}

const columnDefs: { key: keyof NotificationRow; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "message", label: "Message" },
  { key: "type", label: "Type" },
  { key: "isRead", label: "Read" },
  { key: "alertRuleName", label: "Alert Rule" },
  { key: "eventTitle", label: "Event" },
  { key: "patrolTitle", label: "Patrol" },
  { key: "createdAt", label: "Created At" },
];

const csvColumns: CsvColumn<NotificationRow>[] = columnDefs;
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

  // Coerce query-string isRead into a real boolean for the Zod schema.
  const isReadParam = url.searchParams.get("isRead");
  const isReadBool =
    isReadParam === "true"
      ? true
      : isReadParam === "false"
        ? false
        : undefined;

  const notificationTypeParam = url.searchParams.get("notificationType");

  const parsed = notificationListFilters.safeParse({
    isRead: isReadBool,
    notificationType: notificationTypeParam ?? undefined,
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

  // v2 spec: per-user read state lives on NotificationRecipient. We query the
  // recipient side (one row per user per notification) and JOIN Notification
  // for the title/message/type. Tenant scoping is enforced through the join.
  const items = await prisma.notificationRecipient.findMany({
    where: {
      userId: ctx.userId,
      ...(filters.isRead !== undefined ? { isRead: filters.isRead } : {}),
      notification: {
        tenantId: ctx.tenantId,
        ...(filters.notificationType !== undefined
          ? { notificationType: filters.notificationType }
          : {}),
      },
    },
    take: ROW_CAP + 1,
    orderBy: { notification: { createdAt: "desc" } },
    include: {
      notification: {
        include: {
          alertRule: { select: { id: true, name: true } },
          event: { select: { id: true, title: true, state: true } },
          patrol: { select: { id: true, title: true, serialNumber: true } },
        },
      },
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

  type RecipientItem = (typeof items)[number];

  // Flatten the recipient + notification join into export-ready CSV rows.
  // The export ID column is the Notification.id (the alert identity) — not
  // the recipient row ID — since the user only cares about which alert fired.
  const rows: NotificationRow[] = items.map((r: RecipientItem) => ({
    id: r.notification.id,
    title: r.notification.title,
    message: r.notification.message,
    type: r.notification.notificationType,
    isRead: r.isRead ? "true" : "false",
    alertRuleName: r.notification.alertRule?.name ?? "",
    eventTitle: r.notification.event?.title ?? "",
    patrolTitle: r.notification.patrol?.title ?? "",
    createdAt: r.notification.createdAt.toISOString(),
  }));

  const filterHash = hashFilters(filters);
  const filterSummary = summarizeFilters(filters);
  const filename = buildExportFilename("notifications", tenant.slug, format);

  if (format === "csv") {
    const body = toCsv(rows, csvColumns);
    await writeExportAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entity: "notifications",
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
    entity: "Notifications",
    tenantName: tenant.name,
    filterSummary,
    generatedAt: new Date(),
    columns: pdfColumns,
    rows: rows as unknown as Record<string, unknown>[],
  });

  await writeExportAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    entity: "notifications",
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
