import { auth } from "@/server/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  IMPERSONATION_SLUG_COOKIE_NAME,
  parseImpersonationSlugFromHeader,
} from "@/lib/auth/impersonation";

// Path-based multi-tenancy — server-side slug-validation gate (SECURITY,
// defense-in-depth layer 2). Every /[tenant]/* page renders inside this layout.
//
// The URL [tenant] segment is the *requested* tenant. Data scoping in tRPC is
// derived from the authenticated user's JWT (never the URL), but this gate stops
// a normal user from even *loading* another tenant's page shell by editing the
// URL — it re-derives the *authenticated* tenant and requires it to equal the
// requested slug. This catches any request that slips past the edge middleware
// (e.g. a matcher exclusion), so enforcement never depends on middleware alone.
//
//   - Unauthenticated → the per-tenant login for the requested slug.
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
  const session = await auth();

  if (session?.user === undefined) {
    redirect(`/${tenant}/login`);
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
