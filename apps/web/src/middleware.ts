import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/server/auth/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyServiceToken } from "@/server/lib/service-token-guard";

// Edge-compatible auth instance — no bcrypt, no prisma, no node:crypto
const { auth } = NextAuth(edgeAuthConfig);

// next-intl middleware intentionally NOT called here. With no [locale] segments
// in the app directory, running createMiddleware (even with localePrefix:"never")
// causes Next.js to bypass the static prerender for protected routes and serve
// _not-found at runtime. Locale detection happens server-side via the request
// config in src/lib/i18n/request.ts (hardcoded "en"). Reintroduce the i18n
// middleware only when routes are restructured under app/[locale]/.

const publicPaths = ["/login", "/api/auth", "/api/health", "/api/trpc"];

// Phase 8 Batch 5 Sub-batch 5.3a — Puppeteer-only render target.
// /print-render/* bypasses the user session auth gate; access is gated by
// the X-PDF-Renderer-Token header (constant-time compared against env).
// Used only by the marine-guardian-pdf-renderer Docker service over the
// internal Docker network. Direct browser access without the header → 401.
// Path deviates from v2 PRODUCT.md L724 (/_print/*) because Next.js App
// Router treats underscore-prefixed folders as private (excluded from
// routing). See DECISIONS_LOG.md "PDF Renderer Internal Route Path".
const PRINT_RENDER_PREFIX = "/print-render/";
// Asset proxy prefix — renderer-token access for print-render <img> thumbnails.
const RENDERER_ASSET_PREFIX = "/api/assets/";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(PRINT_RENDER_PREFIX)) {
    const expected = process.env.PDF_RENDERER_SERVICE_TOKEN;
    const presented = request.headers.get("x-pdf-renderer-token");
    if (verifyServiceToken(presented, expected)) {
      return NextResponse.next();
    }
    return new NextResponse(null, { status: 401 });
  }

  // Event-report thumbnails (2026-07-03): the print-render event tables embed
  // <img src="/api/assets/{id}">. Puppeteer's page.setExtraHTTPHeaders sends
  // the same X-PDF-Renderer-Token on every subresource fetch, so a presented
  // token routes the asset proxy through the renderer trust boundary (the
  // token already grants the full report HTML, a superset of these photos).
  // No token → the normal session gate below, exactly as before. An INVALID
  // presented token is rejected outright — it never falls back to session.
  if (pathname.startsWith(RENDERER_ASSET_PREFIX)) {
    const presented = request.headers.get("x-pdf-renderer-token");
    if (presented !== null) {
      if (verifyServiceToken(presented, process.env.PDF_RENDERER_SERVICE_TOKEN)) {
        return NextResponse.next();
      }
      return new NextResponse(null, { status: 401 });
    }
  }

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await auth();

  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Bug #6 — Platform-admin (super_admin without tenant context) is redirected
  // to the /admin landing because every tenant-scoped tRPC procedure throws
  // FORBIDDEN with tenantId === "". The empty-string marshalling happens in
  // the session callback at auth.config.ts:24 (null → ""). Non-platform users
  // accessing /admin/* are bounced to /dashboard.
  const isPlatformAdmin =
    session.user.tenantId === "" &&
    session.user.roles.includes("super_admin");
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  const impersonationCookie = request.cookies.get("mg-impersonate-tenant")?.value ?? null;
  // keep in sync with IMPERSONATION_COOKIE_NAME in src/lib/auth/impersonation.ts
  const isImpersonating = isPlatformAdmin && impersonationCookie !== null;

  // Impersonation bypass — super_admin viewing a tenant retains access to both
  // /admin/* (to swap or exit) and tenant routes (the impersonated tenant app).
  // The impersonation cookie is set/cleared exclusively through
  // trpc.platformImpersonation.{enter,exit}, which validates super_admin + audit.
  if (isImpersonating) {
    return NextResponse.next();
  }

  if (isPlatformAdmin && !isAdminPath) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  if (!isPlatformAdmin && isAdminPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|icons|images|api/health|api/auth|api/trpc).*)"],
};
