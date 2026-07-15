// Non-tRPC: manual auth required (security.md L11).
//
// POST /api/cms/media — platform-admin-only upload endpoint for the CMS
// editor's Ctrl+V / drag-drop image paste (CMS_BUILD_PLAN.md — W3/W6).
// Accepts RAW image bytes (no presign — the request body IS the file),
// validates mime + size, writes to the exports bucket under the `cms/`
// prefix, records a CmsMedia row, and returns the PUBLIC serving URL that
// the companion GET route ([...key]/route.ts) streams back.
//
// Security posture:
//   - Manual platform-admin auth via requirePlatformAdminRouteAuth (role
//     tenant_manager + empty tenantId) — tRPC middleware is bypassed for
//     Route Handlers. NOT requireRouteAuth: that helper requires a resolved
//     *tenant* context and would reject a pure-platform session with no
//     active impersonation (see route-auth.ts doc comment).
//   - Rate-limited via the `upload` tier (20/min).
//   - Mime allowlist mirrors packages/storage's ImageContentType union
//     exactly (png/jpeg/webp/gif) — no SVG (script-carrying), no arbitrary
//     types.
//   - Size pre-validated against MAX_IMAGE_BYTES before the upload call so a
//     too-large body returns a clean 413 instead of a storage-layer throw.
//   - middleware.ts does NOT list this exact path as public — anonymous
//     requests are redirected to /login before this handler ever runs
//     (defense-in-depth on top of the in-handler check). Only the GET
//     catch-all route ([...key]) is public.

import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";

import { prisma, writeAuditLog, type PrismaClient } from "@marine-guardian/db";
import {
  uploadImage,
  getExportsBucketName,
  buildCmsMediaKey,
  MAX_IMAGE_BYTES,
  type ImageContentType,
} from "@marine-guardian/storage";
import { requirePlatformAdminRouteAuth, RouteAuthError } from "@/server/lib/route-auth";
import { rateLimiters } from "@/server/lib/rate-limit";

const ALLOWED_CONTENT_TYPES: ReadonlySet<ImageContentType> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const EXT_BY_CONTENT_TYPE: Record<ImageContentType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const CMS_MEDIA_SCOPES = new Set(["docs", "showcase"]);

function isAllowedContentType(value: string): value is ImageContentType {
  return ALLOWED_CONTENT_TYPES.has(value as ImageContentType);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let ctx;
  try {
    ctx = await requirePlatformAdminRouteAuth();
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

  const rawContentType = req.headers.get("content-type");
  if (rawContentType === null || !isAllowedContentType(rawContentType)) {
    return NextResponse.json(
      { error: "Unsupported content type. Allowed: png, jpeg, webp, gif." },
      { status: 415 },
    );
  }
  const contentType = rawContentType;

  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  const arrayBuffer = await req.arrayBuffer();
  const body = Buffer.from(arrayBuffer);

  if (body.length === 0) {
    return NextResponse.json({ error: "Empty body." }, { status: 400 });
  }
  if (body.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  const scopeParam = req.nextUrl.searchParams.get("scope");
  const scope = scopeParam !== null && CMS_MEDIA_SCOPES.has(scopeParam) ? scopeParam : "docs";

  const mediaId = randomUUID();
  const ext = EXT_BY_CONTENT_TYPE[contentType];
  // Content is GLOBAL (CMS_BUILD_PLAN.md) — every CMS upload uses the
  // "global" key segment (tenantId: null) regardless of the uploader.
  const key = buildCmsMediaKey(null, mediaId, ext);

  await uploadImage({
    bucket: getExportsBucketName(),
    key,
    body,
    contentType,
  });

  const row = await prisma.cmsMedia.create({
    data: {
      id: mediaId,
      key,
      mimeType: contentType,
      bytes: body.length,
      scope: scope as "docs" | "showcase",
      tenantId: null,
      uploadedById: ctx.userId,
    },
  });

  await writeAuditLog(prisma as unknown as PrismaClient, {
    tenantId: null,
    userId: ctx.userId,
    action: "CMS_MEDIA_UPLOAD",
    entityType: "CmsMedia",
    entityId: row.id,
    changesJson: { key: row.key, mimeType: row.mimeType, bytes: row.bytes, scope: row.scope },
  });

  return NextResponse.json({ url: `/api/cms/media/${row.key}` }, { status: 201 });
}
