import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/server/auth/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge-compatible auth instance — no bcrypt, no prisma, no node:crypto
const { auth } = NextAuth(edgeAuthConfig);

// next-intl middleware intentionally NOT called here. With no [locale] segments
// in the app directory, running createMiddleware (even with localePrefix:"never")
// causes Next.js to bypass the static prerender for protected routes and serve
// _not-found at runtime. Locale detection happens server-side via the request
// config in src/lib/i18n/request.ts (hardcoded "en"). Reintroduce the i18n
// middleware only when routes are restructured under app/[locale]/.

const publicPaths = ["/login", "/api/auth", "/api/health", "/api/trpc"];

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
