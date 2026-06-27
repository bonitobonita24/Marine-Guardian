// Non-tRPC: manual auth required (security.md L11).
//
// Streams an EventAsset's bytes from Telegram (off-app ER asset storage,
// Stage 4 of the Telegram asset pipeline). The asset bytes live in a private
// Telegram channel; this route proxies them via the bot token so the
// event-detail UI can render photos inline.
//
// Security posture (per security.md):
//   - Manual auth via requireRouteAuth (tRPC bypassed — no middleware chain).
//   - Tenant scope enforced server-side via session.tenantId. The URL carries
//     only the asset id; the lookup is `id + tenantId`, so cross-tenant access
//     is impossible at the data layer. Returns 404 (not 403) on miss.
//   - 404 when the asset has no telegramFileId (not yet archived).
//   - ASSET_DOWNLOAD AuditLog written before the Telegram fetch (L5 egress audit).
//   - Rate-limited via the `upload` tier.
//   - telegramFileId is never returned to the client; bytes are proxied
//     server-side via the bot token only.

import { type NextRequest, NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";

import { prisma } from "@marine-guardian/db";
import { mimeFromFilename } from "@marine-guardian/shared/lib/asset-mime";
import {
  getTelegramBotToken,
  fetchTelegramFileBytes,
} from "@marine-guardian/jobs/lib/telegram-storage";
import { requireRouteAuth, RouteAuthError } from "@/server/lib/route-auth";
import { rateLimiters } from "@/server/lib/rate-limit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Content-Types safe to serve inline (inert — no script execution). Anything
// not in this set is forced to a neutral download. SVG is deliberately absent
// (image/svg+xml can carry embedded script — security.md).
const SAFE_INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

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

  const row = await prisma.eventAsset.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      eventId: true,
      filename: true,
      mimeType: true,
      telegramFileId: true,
    },
  });

  // 404 on missing OR cross-tenant — never 403 (leaks tenant occupancy).
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 404 when the asset was never archived to Telegram (no file to fetch).
  if (row.telegramFileId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Audit the egress BEFORE the Telegram fetch so an interrupted fetch still
  // leaves a record of who attempted the download.
  await prisma.auditLog.create({
    data: {
      action: "ASSET_DOWNLOAD",
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      entityType: "EventAsset",
      entityId: row.id,
      changesJson: {
        eventId: row.eventId,
        filename: row.filename,
      },
    },
  });

  const botToken = getTelegramBotToken();
  const { bytes } = await fetchTelegramFileBytes({
    botToken,
    fileId: row.telegramFileId,
  });

  // The archiver does not always persist mimeType; fall back to the filename
  // extension so images render inline rather than forcing a download.
  //
  // SECURITY: row.mimeType is attacker-influenceable (it originates from the
  // upstream ER source, not a trusted server). Serving an arbitrary stored
  // Content-Type inline (e.g. text/html, image/svg+xml) is a stored-XSS vector.
  // Only allowlisted, inert types are served inline; everything else is forced
  // to a download with a neutral type. A sandbox CSP + nosniff add defence in
  // depth so even a misclassified response cannot execute script.
  const rawType =
    row.mimeType ?? mimeFromFilename(row.filename) ?? "application/octet-stream";
  const inlineSafe = SAFE_INLINE_TYPES.has(rawType);
  const contentType = inlineSafe ? rawType : "application/octet-stream";
  const disposition = inlineSafe ? "inline" : "attachment";
  // Strip quote/CR/LF/backslash from the filename to prevent Content-Disposition
  // header injection / quote-breaking.
  const safeName = row.filename.replace(/["\r\n\\]/g, "_");

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `${disposition}; filename="${safeName}"`,
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": "private, max-age=300",
    "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  });

  return new Response(bytes, { status: 200, headers });
}
