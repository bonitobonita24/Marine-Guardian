import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/server/auth/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyServiceToken } from "@/server/lib/service-token-guard";
import { IMPERSONATION_SLUG_COOKIE_NAME } from "@/lib/auth/impersonation";
import { getFeature } from "@/lib/rbac/feature-registry";
import type { CustomRolePermissionSummary } from "@/server/auth/types";

// Edge-compatible auth instance — no bcrypt, no prisma, no node:crypto
const { auth } = NextAuth(edgeAuthConfig);

// next-intl middleware intentionally NOT called here. With no [locale] segments
// in the app directory, running createMiddleware (even with localePrefix:"never")
// causes Next.js to bypass the static prerender for protected routes and serve
// _not-found at runtime. Locale detection happens server-side via the request
// config in src/lib/i18n/request.ts (hardcoded "en"). Reintroduce the i18n
// middleware only when routes are restructured under app/[locale]/.

// Path-based multi-tenancy (feat/tenant-path-routing) — every tenant page lives
// at /[slug]/…; the platform super_admin console stays at top-level /admin, and
// the platform login stays at top-level /login. SECURITY (defense-in-depth L1,
// edge): this gate can only see the JWT + cookies + path (no Prisma), so the
// slug check compares the requested URL slug against the tenantSlug CLAIM carried
// in the JWT (session.user.tenantSlug, added in server/auth). Row-level data
// scoping in tRPC still derives ONLY from the JWT/impersonation-id-cookie, never
// the URL — this gate just stops a user from reaching another tenant's pages.

// Segments that are NOT tenant slugs.
const RESERVED_SEGMENTS = new Set(["", "admin", "api", "login", "privacy", "print-render"]);

// Top-level path segments the tenant-slug resolver must never treat as a [tenant]
// slug. Superset of RESERVED_SEGMENTS plus Next internals; used by the early
// static-asset / reserved-path passthrough guard.
const RESERVED_FIRST_SEGMENTS = new Set([
  "admin",
  "api",
  "login",
  "privacy",
  "print-render",
  "_next",
]);

function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

// A first segment that looks like a filename (contains a ".") is a root static
// asset — favicon.ico, icon.svg, apple-icon*.png, robots.txt, sitemap.xml,
// manifest.webmanifest, etc. Tenant slugs never contain a dot.
function isStaticAssetSegment(seg: string): boolean {
  return seg.includes(".");
}

// True when the first path segment must NOT be resolved as a tenant slug: it is a
// reserved top-level path, a Next internal, or a root static file.
function isReservedOrAsset(seg: string): boolean {
  return RESERVED_FIRST_SEGMENTS.has(seg) || isStaticAssetSegment(seg);
}

// The path with its leading tenant slug removed, for reuse of the existing
// prefix allow-lists (e.g. "/demo-site/settings/breach" -> "/settings/breach").
function stripSlug(pathname: string): string {
  const rest = pathname.split("/").filter(Boolean).slice(1).join("/");
  return `/${rest}`;
}

// Puppeteer-only render target (Phase 8 Batch 5.3a). /print-render/* bypasses
// the user session auth gate; access is gated by the X-PDF-Renderer-Token header
// (constant-time compared against env). Preserved EXACTLY.
const PRINT_RENDER_PREFIX = "/print-render/";
// Asset proxy prefix — renderer-token access for print-render <img> thumbnails.
const RENDERER_ASSET_PREFIX = "/api/assets/";

// Public paths (no session required). "/login" = platform/super_admin login;
// "/privacy" = the standalone privacy notice; "/showcase" = the public,
// unauthenticated product/marketing showcase page (+ its /showcase/* static
// assets under public/showcase/); api auth/health/trpc handshakes.
const publicPaths = ["/login", "/privacy", "/showcase", "/api/auth", "/api/health", "/api/trpc"];
// Per-tenant login: /[slug]/login (and trailing slash). Public — a tenant user
// must reach their own login while unauthenticated.
const TENANT_LOGIN_RE = /^\/[^/]+\/login\/?$/;

// viewer role — strictly read-only, scoped to Command Center (/dashboard) +
// Interactive Report Map (/map) + Exports (/exports) + Profile (/profile).
// Checked against the slug-stripped path (see stripSlug).
const VIEWER_ALLOWED_PREFIXES = ["/dashboard", "/map", "/exports", "/doodles", "/profile"];

function isViewerAllowedPath(pathname: string): boolean {
  return VIEWER_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// Tenant-admin-area prefixes — /users (user management) + /settings (tenant
// configuration). Checked against the slug-stripped path. WIDENED 2026-07-10:
// tenant_manager (platform) AND tenant_superadmin (the tenant's own owner)
// may both reach these — see isTenantAdminAreaUser below. Renamed from
// SUPER_ADMIN_ONLY_PREFIXES for clarity now that it is no longer
// tenant_manager-exclusive.
const TENANT_ADMIN_AREA_PREFIXES = ["/users", "/settings"];

function isTenantAdminAreaPath(pathname: string): boolean {
  return TENANT_ADMIN_AREA_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// Custom-role (data-driven, tenant-rbac-standard §4) coarse route gate.
// Segments that are ALWAYS allowed for a custom-role user regardless of the
// matrix — the landing page and the self-service profile page must never be
// unreachable. `/users` and `/settings` are deliberately NOT handled here:
// they are already gated above by isTenantAdminAreaPath (custom roles never
// carry tenant_superadmin/tenant_manager, so that gate already excludes them).
const CUSTOM_ROLE_ALWAYS_ALLOWED_SEGMENTS = new Set(["dashboard", "profile"]);

// The first slug-stripped path segment, e.g. "/patrol-areas/123" -> "patrol-areas".
function firstRestSegment(rest: string): string {
  return rest.split("/").filter(Boolean)[0] ?? "";
}

// Edge-only deny-by-default view gate for custom-role users. Only acts on
// segments present in FEATURE_REGISTRY; any other segment (not a registered
// grantable feature) is left to the existing gates above and is NOT blocked
// here. This is a coarse nav guard only — matrixProcedure re-resolves the
// full CRUD matrix from the DB server-side and is the sole authority.
function isCustomRoleViewAllowedPath(
  rest: string,
  permissions: CustomRolePermissionSummary | null | undefined,
): boolean {
  const segment = firstRestSegment(rest);
  if (CUSTOM_ROLE_ALWAYS_ALLOWED_SEGMENTS.has(segment)) {
    return true;
  }
  const feature = getFeature(segment);
  if (!feature) {
    // Not a registered grantable feature (e.g. /users, /settings — already
    // handled by isTenantAdminAreaPath) — do not gate it here.
    return true;
  }
  return permissions?.[feature.key]?.view === true;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Static assets & Next internals never resolve as a [tenant] slug -----
  // A root static file (favicon.ico, icon.svg, apple-icon*.png, robots.txt,
  // sitemap.xml, manifest.webmanifest, …) or a Next internal (_next/*) flows
  // straight through. Without this guard the tenant-slug resolver rewrites e.g.
  // /icon.svg -> /icon.svg/login (unauth) or /icon.svg -> /<tenant>/dashboard
  // (authed), emitting bogus 307s + console errors. `config.matcher` also
  // excludes these, but this guard is the authoritative, unit-tested defense.
  const firstSeg = firstSegment(pathname);
  if (firstSeg === "_next" || isStaticAssetSegment(firstSeg)) {
    return NextResponse.next();
  }

  // --- Passthroughs (unchanged) -------------------------------------------
  if (pathname.startsWith(PRINT_RENDER_PREFIX)) {
    const expected = process.env.PDF_RENDERER_SERVICE_TOKEN;
    const presented = request.headers.get("x-pdf-renderer-token");
    if (verifyServiceToken(presented, expected)) {
      return NextResponse.next();
    }
    return new NextResponse(null, { status: 401 });
  }

  if (pathname.startsWith(RENDERER_ASSET_PREFIX)) {
    const presented = request.headers.get("x-pdf-renderer-token");
    if (presented !== null) {
      if (verifyServiceToken(presented, process.env.PDF_RENDERER_SERVICE_TOKEN)) {
        return NextResponse.next();
      }
      return new NextResponse(null, { status: 401 });
    }
  }

  // --- Public paths --------------------------------------------------------
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    TENANT_LOGIN_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const session = await auth();
  const seg = firstSegment(pathname);
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isRoot = pathname === "/";
  const isApiPath = seg === "api";

  // --- Unauthenticated -----------------------------------------------------
  if (!session?.user) {
    // Reserved (admin/api/root/...) or a static-asset/_next segment → platform
    // login. Only a real tenant slug → that tenant's own login, preserving the
    // deep-link as callbackUrl.
    if (RESERVED_SEGMENTS.has(seg) || isReservedOrAsset(seg)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    const loginUrl = new URL(`/${seg}/login`, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Authenticated -------------------------------------------------------
  const roles = session.user.roles;
  const tenantSlug = session.user.tenantSlug; // "" for platform super_admin
  const isSuperAdmin = roles.includes("tenant_manager");
  const isPlatformUser = isSuperAdmin && tenantSlug === "";
  const impersonationSlug =
    request.cookies.get(IMPERSONATION_SLUG_COOKIE_NAME)?.value ?? null;

  // Other API routes (assets w/o token, stream, exports) — authorization is
  // enforced at the route/tRPC layer, not here. Allow through once authed.
  if (isApiPath) {
    return NextResponse.next();
  }

  // /admin/* — platform super_admin only.
  if (isAdminPath) {
    if (isPlatformUser) {
      return NextResponse.next();
    }
    if (tenantSlug !== "") {
      return NextResponse.redirect(new URL(`/${tenantSlug}/dashboard`, request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Root "/" — hand off to the app/page.tsx session dispatcher.
  if (isRoot) {
    return NextResponse.next();
  }

  // Stale / malformed JWT guard: a non-platform authenticated user MUST carry a
  // tenant slug. An empty slug here means a session minted before a role/tenant
  // change that did not bump securityVersion (e.g. a direct-SQL RBAC
  // reconciliation), or an otherwise broken token. Without this guard the
  // tenant-path redirects below build `/${tenantSlug}/dashboard` === "//dashboard"
  // (a protocol-relative host, DNS_PROBE_FINISHED_NXDOMAIN). Redirect to the
  // login for the tenant IN THE URL — NOT the platform /login, where a tenant
  // account cannot sign in — and CLEAR the bad session so the tenant login page
  // renders its form instead of bouncing an "authenticated" visitor to the
  // dashboard (which would loop straight back through this guard).
  if (!isPlatformUser && tenantSlug === "") {
    const res = NextResponse.redirect(new URL(`/${seg}/login`, request.url));
    for (const c of request.cookies.getAll()) {
      if (c.name.includes("authjs.session-token")) {
        res.cookies.set(c.name, "", {
          maxAge: 0,
          path: "/",
          secure: c.name.startsWith("__Secure-"),
        });
      }
    }
    return res;
  }

  // Tenant path /[slug]/… — `seg` is the REQUESTED tenant.
  if (isPlatformUser) {
    // Platform super_admin may only enter a tenant app while impersonating, and
    // only the tenant they entered (impersonation-slug cookie). Row scoping is
    // still driven by the impersonation-id cookie in tRPC.
    if (impersonationSlug !== null && impersonationSlug === seg) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Ordinary tenant-scoped user: the requested slug MUST equal their own tenant
  // (the cross-tenant-URL-access denial — a user editing the URL to another
  // tenant is bounced back to their own dashboard).
  if (seg !== tenantSlug) {
    return NextResponse.redirect(new URL(`/${tenantSlug}/dashboard`, request.url));
  }

  // Slug matches — run the viewer + super_admin-only page gates against the
  // slug-stripped path (defense in depth; nav-hide alone is cosmetic).
  const rest = stripSlug(pathname);
  const isViewer = roles.includes("viewer");
  if (isViewer && !isViewerAllowedPath(rest)) {
    return NextResponse.redirect(new URL(`/${tenantSlug}/dashboard`, request.url));
  }
  // tenant_manager OR tenant_superadmin may reach /users + /settings — the
  // tenant owner manages its own tenant, not just the platform (2026-07-10).
  const isTenantAdminAreaUser = isSuperAdmin || roles.includes("tenant_superadmin");
  if (!isTenantAdminAreaUser && isTenantAdminAreaPath(rest)) {
    return NextResponse.redirect(new URL(`/${tenantSlug}/dashboard`, request.url));
  }

  // Custom-role (data-driven matrix, tenant-rbac-standard §4) coarse route
  // gate — deny-by-default on `view`. Fine-grained CRUD enforcement happens
  // server-side in tRPC matrixProcedure; this is only the edge nav guard, so
  // a custom-role user can never even land on a page it has no `view` on.
  if (
    session.user.customRoleId != null &&
    !isCustomRoleViewAllowedPath(rest, session.user.customRolePermissions)
  ) {
    return NextResponse.redirect(new URL(`/${tenantSlug}/dashboard`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, root static files, and the handshake API routes. The
  // trailing `[\\w-]+\\.[\\w]+` clause excludes ANY root file with an extension
  // (icon.svg, apple-icon.png, robots.txt, sitemap.xml, manifest.webmanifest,
  // …) so they never reach the tenant-slug resolver. The in-handler guard
  // (isStaticAssetSegment) is the authoritative, unit-tested backstop.
  matcher: [
    "/((?!_next/static|_next/image|_next|favicon.ico|icon.svg|apple-icon|icons|images|robots.txt|sitemap.xml|manifest.webmanifest|api/health|api/auth|api/trpc|[\\w-]+\\.[\\w]+).*)",
  ],
};
