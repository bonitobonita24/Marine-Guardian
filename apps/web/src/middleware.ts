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

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await auth();

  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|icons|images|api/health|api/auth|api/trpc).*)"],
};
