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
import {
  mimeFromFilename,
  SAFE_INLINE_IMAGE_TYPES,
} from "@marine-guardian/shared/lib/asset-mime";
import { getTelegramBotToken } from "@marine-guardian/jobs/lib/telegram-storage";
import { requireRouteAuth, RouteAuthError } from "@/server/lib/route-auth";
import { rateLimiters } from "@/server/lib/rate-limit";
import { resolveAssetBytes } from "@/server/lib/asset-bytes";
import { verifyServiceToken } from "@/server/lib/service-token-guard";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Content-Types safe to serve inline (inert — no script execution). Anything
// not in this set is forced to a neutral download. SVG is deliberately absent
// (image/svg+xml can carry embedded script — security.md). The image subset
// is the shared SAFE_INLINE_IMAGE_TYPES so the print-report thumbnail picker
// (photoAssetIdsFrom) gates on exactly what this route will render inline.
const SAFE_INLINE_TYPES = new Set([
  ...SAFE_INLINE_IMAGE_TYPES,
  "application/pdf",
]);

export async function GET(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  // Renderer-service mode (2026-07-03): the printable Report Map's event
  // tables embed <img src="/api/assets/{id}"> thumbnails; headless Chrome
  // sends the X-PDF-Renderer-Token on those subresource fetches (Puppeteer
  // page.setExtraHTTPHeaders). A VALID token bypasses the session gate —
  // the same shared secret already grants the full print-render HTML (a
  // strict superset of these photo bytes), so trust parity holds. Tenant
  // scoping is waived only in this mode: the renderer is an internal,
  // token-gated service rendering server-composed URLs, never user input.
  const presentedRendererToken = req.headers.get("x-pdf-renderer-token");
  const isRendererService =
    presentedRendererToken !== null &&
    verifyServiceToken(
      presentedRendererToken,
      process.env.PDF_RENDERER_SERVICE_TOKEN,
    );
  if (presentedRendererToken !== null && !isRendererService) {
    // A presented-but-invalid service token NEVER falls back to session auth.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ctx = null;
  if (!isRendererService) {
    try {
      ctx = await requireRouteAuth();
    } catch (e) {
      if (e instanceof RouteAuthError) return e.response;
      throw e;
    }

    try {
      rateLimiters.assetRead.check(ctx.userId);
    } catch (e) {
      if (e instanceof TRPCError && e.code === "TOO_MANY_REQUESTS") {
        return NextResponse.json(
          { error: "Rate limit exceeded. Try again later." },
          { status: 429 },
        );
      }
      throw e;
    }
  }

  const { id } = await params;

  const row = await prisma.eventAsset.findFirst({
    // Session mode: tenant-scoped lookup. Renderer mode: id-only (see above).
    where: ctx !== null ? { id, tenantId: ctx.tenantId } : { id },
    select: {
      id: true,
      tenantId: true,
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
  // leaves a record of who attempted the download. Renderer-mode reads carry
  // no user identity (AuditLog.userId is non-nullable) — that egress is
  // covered by the report export's own job/audit trail instead.
  if (ctx !== null) {
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
  }

  const botToken = getTelegramBotToken();

  // The archiver does not always persist mimeType; fall back to the filename
  // extension so images render inline rather than forcing a download.
  //
  // SECURITY: row.mimeType is attacker-influenceable (it originates from the
  // upstream ER source, not a trusted server). Serving an arbitrary stored
  // Content-Type inline (e.g. text/html, image/svg+xml) is a stored-XSS vector.
  // Only allowlisted, inert types are served inline; everything else is forced
  // to a download with a neutral type. A sandbox CSP + nosniff add defence in
  // depth so even a misclassified response cannot execute script.
  //
  // rawType is computed BEFORE byte resolution so it can double as the R2
  // write-through metadata. The inline-serve allowlist below gates on THIS
  // row-derived type, never on the cached object's contentType.
  const rawType =
    row.mimeType ?? mimeFromFilename(row.filename) ?? "application/octet-stream";

  // Renderer mode serves ONLY inline-safe image types — the print report's
  // <img> thumbnails are its sole use case. This narrows what a leaked
  // service token could exfiltrate through this route to the image class
  // (PDFs/videos/unknown types stay session-gated). 404, not 403, to match
  // the route's no-leak posture.
  if (ctx === null && !SAFE_INLINE_IMAGE_TYPES.has(rawType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve bytes via the R2 read-through cache (when enabled) → Telegram.
  // Any failure (Telegram down, rate-limited beyond retries, >20MB getFile cap)
  // becomes a clean 502 instead of an unhandled 500, so the UI degrades to a
  // graceful fallback rather than a broken image.
  let bytes: Buffer;
  try {
    const resolved = await resolveAssetBytes({
      // The asset row's OWN tenant (identical to ctx.tenantId in session mode
      // — the lookup was tenant-scoped) keeps the R2 cache key tenant-correct
      // in renderer mode too.
      tenantId: row.tenantId,
      assetId: row.id,
      telegramFileId: row.telegramFileId,
      botToken,
      contentType: rawType,
    });
    bytes = resolved.bytes;
  } catch {
    return NextResponse.json(
      { error: "Asset temporarily unavailable" },
      { status: 502 },
    );
  }

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
    // EventAsset bytes are immutable, so allow each authenticated browser to
    // reuse a photo for repeat modal opens / marker clicks for up to a day.
    // KEEP `private`: these are auth/tenant-scoped photos that must NEVER land
    // in a shared CDN/edge cache (that would leak one tenant's photos to others).
    "Cache-Control": "private, max-age=86400, immutable",
    "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  });

  // Wrap in a fresh Uint8Array so the body is a concrete ArrayBuffer-backed
  // view (BodyInit) regardless of the Buffer's pooled backing store.
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
