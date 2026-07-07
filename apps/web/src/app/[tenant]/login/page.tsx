import { Suspense } from "react";
import { TenantLoginForm } from "./tenant-login-form";

// Per-tenant login (/[tenant]/login). The tenant is taken from the URL and
// submitted to authorize() as `tenantSlug`, which binds the credential to this
// tenant (a valid password for tenant A cannot mint a session here for tenant
// B — see server/auth/config.ts). After login the user lands on
// /[tenant]/dashboard. The platform/super_admin login stays at top-level /login.
export default async function TenantLoginPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return (
    <Suspense>
      <TenantLoginForm tenant={tenant} />
    </Suspense>
  );
}
