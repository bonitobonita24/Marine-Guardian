// Non-tRPC. PUBLIC route — see security note below (CMS_BUILD_PLAN.md — W3).
//
// GET /api/cms/media/<key...> — streams CMS-uploaded media bytes (images
// pasted into the docs/showcase editor, W6) for public, unauthenticated
// consumption. Unlike the tenant-scoped `/api/assets/[id]` proxy, this route
// is INTENTIONALLY public and NOT tenant-scoped: the pages that embed this
// media (/docs, /showcase) are themselves public routes (middleware.ts
// publicPaths), so gating the images behind auth would just break the pages
// that render them for anonymous visitors.
//
// Security posture (copies the assets route's serving hygiene, drops the
// tenant/session gate):
//   - Content-Type is looked up from the CmsMedia row (the value POST
//     validated at upload time), never trusted from the request.
//   - Only the same 4-type allowlist the POST route enforces may be served
//     inline (defense-in-depth — should be unreachable given POST's own
//     validation, but never trust a stored value blindly). No SVG.
//   - `X-Content-Type-Options: nosniff` + a locked-down CSP on the response.
//   - Path traversal / malformed segments are rejected before any DB lookup
//     (empty segment, "..", backslash) and the reconstructed key must start
//     with the `cms/` prefix every upload writes under.
//   - 404 (not 403) on any miss/mismatch — matches the no-leak posture of
//     the assets route.
//   - Long-lived PUBLIC cache: keys are content-addressed by a fresh
//     mediaId per upload (immutable), so there is no invalidation need.
//
// middleware.ts publicPaths carries "/api/cms/media/" (WITH the trailing
// slash) so this catch-all is public while the sibling POST at the bare
// "/api/cms/media" path (no trailing segment) stays gated.

import { Readable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";

import { prisma } from "@marine-guardian/db";
import { getImageReadStream, getExportsBucketName } from "@marine-guardian/storage";

interface RouteParams {
  params: Promise<{ key: string[] }>;
}

const SAFE_INLINE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function isValidKeySegments(segments: string[]): boolean {
  if (segments.length === 0) return false;
  return segments.every(
    (seg) => seg !== "" && seg !== ".." && !seg.includes("\\") && !seg.includes("/"),
  );
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  const { key: keySegments } = await params;

  if (!isValidKeySegments(keySegments)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = keySegments.join("/");
  // Containment guard: every CmsMedia key is written under the `cms/`
  // prefix by the POST route (buildCmsMediaKey) — reject anything else
  // before it ever reaches the DB lookup or the storage client.
  if (!key.startsWith("cms/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = await prisma.cmsMedia.findUnique({
    where: { key },
    select: { key: true, mimeType: true },
  });

  if (row === null || !SAFE_INLINE_MEDIA_TYPES.has(row.mimeType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let nodeStream: Readable;
  try {
    nodeStream = await getImageReadStream({
      bucket: getExportsBucketName(),
      key: row.key,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  const headers = new Headers({
    "Content-Type": row.mimeType,
    // Public + immutable: mediaId is a fresh UUID per upload, so a given key
    // never changes content — safe for browsers/edge caches to cache long.
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  });

  return new Response(webStream, { status: 200, headers });
}
