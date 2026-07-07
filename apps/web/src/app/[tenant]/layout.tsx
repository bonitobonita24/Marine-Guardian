import { auth } from "@/server/auth";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  IMPERSONATION_SLUG_COOKIE_NAME,
  parseImpersonationSlugFromHeader,
} from "@/lib/auth/impersonation";

// Path-based multi-tenancy — server-side slug-validation gate (SECURITY,
// defense-in-depth layer 2). Every /[tenant]/* page renders inside this layout —
// INCLUDING the per-tenant login page (/[tenant]/login) and the (dashboard)
// authed pages, which are sibling children of this layout.
//
// The URL [tenant] segment is the *requested* tenant. Data scoping in tRPC is
// derived from the authenticated user's JWT (never the URL), but this gate stops
// a normal user from even *loading* another tenant's page shell by editing the
// URL — it re-derives the *authenticated* tenant and requires it to equal the
// requested slug. This catches any request that slips past the edge middleware
// (e.g. a matcher exclusion), so enforcement never depends on middleware alone.
//
// IMPORTANT: this layout MUST NOT redirect a session-less request to the tenant
// login. Because it also wraps /[tenant]/login, doing so re-enters this same
// layout for the login page and infinite-loops (ERR_TOO_MANY_REDIRECTS). The
// unauth→login gate for the AUTHED pages lives in (dashboard)/layout.tsx, which
// wraps only the (dashboard) route group and NOT the sibling login page. So here
// an unauthenticated request simply passes through, letting the login page (or,
// for a deep-linked authed page, (dashboard)/layout) do the right thing. The
// edge middleware (defense-in-depth L1) already redirects unauth deep-links to
// the tenant login with a callbackUrl.
//
//   - Unauthenticated → pass through (login page renders; authed pages are
//     gated by (dashboard)/layout.tsx).
//   - Normal tenant user → session.user.tenantSlug must equal params.tenant.
//   - super_admin impersonating a tenant → the mg-impersonate-slug cookie must
//     equal params.tenant (the impersonated tenant).
//   - super_admin NOT impersonating → belongs on /admin, not a tenant app.
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  // Root static-asset requests with no more-specific route (favicon.ico,
  // robots.txt, apple-icon.png, sitemap.xml, …) fall through to this catch-all
  // [tenant] segment. A real tenant slug NEVER contains a dot, so treating such a
  // request as a tenant would 307 it into /<file>/dashboard (via page.tsx).
  // Reject as 404 — the correct "no such resource" answer, and the L2 mirror of
  // the edge middleware's static-asset guard (a request that skips middleware via
  // a matcher exclusion still lands here). Real assets like /icon.svg resolve to
  // their own more-specific route and never enter this layout.
  if (tenant.includes(".")) {
    notFound();
  }

  const session = await auth();

  if (session?.user === undefined) {
    // Session-less: do NOT redirect here (would loop the login page, which is a
    // child of this layout). The child login page renders; authed pages are
    // protected one level down in (dashboard)/layout.tsx.
    return <>{children}</>;
  }

  const isSuperAdmin = session.user.roles.includes("super_admin");
  const isPlatformUser = isSuperAdmin && session.user.tenantSlug === "";

  if (isPlatformUser) {
    // Platform super_admin: only allowed into a tenant app while impersonating,
    // and only into the tenant they are impersonating.
    const cookieStore = await cookies();
    const raw = cookieStore.get(IMPERSONATION_SLUG_COOKIE_NAME)?.value;
    const impersonatedSlug = parseImpersonationSlugFromHeader(
      raw === undefined ? null : `${IMPERSONATION_SLUG_COOKIE_NAME}=${raw}`,
    );
    if (impersonatedSlug === null || impersonatedSlug !== tenant) {
      redirect("/admin");
    }
  } else {
    // Ordinary tenant-scoped user: the requested slug MUST be their own tenant.
    if (session.user.tenantSlug !== tenant) {
      redirect(`/${session.user.tenantSlug}/dashboard`);
    }
  }

  return <>{children}</>;
}
