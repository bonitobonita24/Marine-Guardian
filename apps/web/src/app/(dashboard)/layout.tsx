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
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Bug #6 — super_admins have no home tenant: the session callback normalizes a
  // null DB tenantId to "" (see auth/config.ts). Rendering a tenant-scoped
  // dashboard for them yields empty/broken pages, so gate them to the platform
  // console (/admin, shipped in e5cd29d) before any tenant-scoped child renders.
  //
  // Exception: a super_admin actively impersonating a tenant via the
  // `mg-impersonate-tenant` cookie (Item 4) legitimately browses that tenant's
  // dashboard while session.tenantId stays "" — do NOT redirect them. Detection
  // mirrors requireRouteAuth() in server/lib/route-auth.ts.
  if (
    session !== null &&
    session.user.roles.includes("super_admin") &&
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
