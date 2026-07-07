import { Suspense } from "react";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { TenantLoginForm } from "./tenant-login-form";

// Per-tenant login (/[tenant]/login). The tenant is taken from the URL and
// submitted to authorize() as `tenantSlug`, which binds the credential to this
// tenant (a valid password for tenant A cannot mint a session here for tenant
// B — see server/auth/config.ts). After login the user lands on
// /[tenant]/dashboard. The platform/super_admin login stays at top-level /login.
//
// This page sits OUTSIDE (dashboard)/layout.tsx (the authed gate), so an
// unauthenticated visitor renders the form normally (no redirect loop). An
// already-authenticated visitor is sent to their tenant dashboard rather than
// being shown a sign-in form. The parent [tenant]/layout.tsx has already bounced
// any authenticated cross-tenant/impersonation mismatch before we get here, so a
// session reaching this point belongs on this tenant's dashboard.
export default async function TenantLoginPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  const session = await auth();
  if (session?.user !== undefined) {
    redirect(`/${tenant}/dashboard`);
  }

  return (
    <Suspense>
      <TenantLoginForm tenant={tenant} />
    </Suspense>
  );
}
