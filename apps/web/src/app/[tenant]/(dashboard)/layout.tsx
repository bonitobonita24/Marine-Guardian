import { auth } from "@/server/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  parseImpersonationCookieFromHeader,
  IMPERSONATION_COOKIE_NAME,
} from "@/lib/auth/impersonation";
import { SessionProvider } from "next-auth/react";
import { FullscreenShell } from "@/components/layout/fullscreen-shell";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { ImpersonationBanner } from "@/components/impersonation-banner";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const session = await auth();

  // Server-side auth gate (SECURITY, defense-in-depth layer 2) for every authed
  // tenant page. This layout wraps ONLY the (dashboard) route group — NOT the
  // sibling /[tenant]/login page — so redirecting an unauthenticated request to
  // the tenant login here cannot re-enter itself (no ERR_TOO_MANY_REDIRECTS).
  // Mirrors the edge middleware (L1); enforcement never depends on middleware
  // alone (e.g. if a matcher exclusion let a request through, this still holds).
  if (session?.user === undefined) {
    redirect(`/${tenant}/login`);
  }

  // Bug #6 — super_admins have no home tenant: the session callback normalizes a
  // null DB tenantId to "" (see auth/config.ts). Rendering a tenant-scoped
  // dashboard for them yields empty/broken pages, so gate them to the platform
  // console (/admin, shipped in e5cd29d) before any tenant-scoped child renders.
  //
  // Exception: a super_admin actively impersonating a tenant via the
  // `mg-impersonate-tenant` cookie (Item 4) legitimately browses that tenant's
  // dashboard while session.tenantId stays "" — do NOT redirect them. Detection
  // mirrors requireRouteAuth() in server/lib/route-auth.ts.
  // (session is guaranteed non-null here — the unauth gate above redirects.)
  if (
    session.user.roles.includes("tenant_manager") &&
    session.user.tenantId === ""
  ) {
    const cookieStore = await cookies();
    const raw = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
    const impersonationTenantId = parseImpersonationCookieFromHeader(
      raw === undefined ? null : `${IMPERSONATION_COOKIE_NAME}=${raw}`,
    );
    if (impersonationTenantId === null) {
      redirect("/admin");
    }
  }

  return (
    <SessionProvider>
      <RealtimeProvider>
        <ImpersonationBanner />
        <FullscreenShell>{children}</FullscreenShell>
      </RealtimeProvider>
    </SessionProvider>
  );
}
