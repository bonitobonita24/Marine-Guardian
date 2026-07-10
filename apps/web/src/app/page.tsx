import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

// Root route "/". There is no UI here — it dispatches by session:
//   - super_admin / platform user (tenantSlug === "") → /admin
//   - ordinary tenant user → /{tenantSlug}/dashboard (path-based tenancy)
//   - unauthenticated → /login (platform login; tenant users use /{tenant}/login)
// Middleware already bounces unauthenticated requests, but this stays
// session-aware so a post-login callbackUrl="/" lands each role correctly.
export default async function RootPage() {
  const session = await auth();

  if (session?.user === undefined) {
    redirect("/login");
  }

  const isPlatformUser =
    session.user.roles.includes("tenant_manager") &&
    session.user.tenantSlug === "";
  if (isPlatformUser) {
    redirect("/admin");
  }

  redirect(`/${session.user.tenantSlug}/dashboard`);
}
