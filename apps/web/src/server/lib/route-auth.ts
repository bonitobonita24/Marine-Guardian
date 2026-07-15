import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import {
  parseImpersonationCookieFromHeader,
  IMPERSONATION_COOKIE_NAME,
} from "@/lib/auth/impersonation";

export interface RouteAuthContext {
  userId: string;
  tenantId: string;
  roles: string[];
  isPlatformImpersonating: boolean;
}

export class RouteAuthError extends Error {
  readonly response: NextResponse;
  constructor(response: NextResponse) {
    super("Route handler authentication failed");
    this.response = response;
  }
}

const unauthorized = (): RouteAuthError =>
  new RouteAuthError(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

const forbidden = (): RouteAuthError =>
  new RouteAuthError(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

export interface PlatformAdminRouteAuthContext {
  userId: string;
  roles: string[];
}

/**
 * Verify the current request has a valid authenticated session with tenant context.
 *
 * Route Handlers bypass tRPC middleware (security.md L11) so they MUST call this.
 * Mirrors the platform-impersonation logic from `protectedProcedure` in trpc.ts:
 * a super_admin with an empty session.tenantId AND a valid `mg-impersonate-tenant`
 * cookie is treated as operating in the cookie's tenant context.
 */
export async function requireRouteAuth(): Promise<RouteAuthContext> {
  const session = await auth();
  if (session === null || session.user.id === "") {
    throw unauthorized();
  }

  const sessionTenantId = session.user.tenantId;
  const roles = session.user.roles;

  // Parse impersonation cookie via next/headers. Build a synthetic Cookie header
  // string so we can reuse parseImpersonationCookieFromHeader (which already
  // validates the cuid shape — defense-in-depth against tampering).
  const cookieStore = await cookies();
  const raw = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  const impersonationTenantId = parseImpersonationCookieFromHeader(
    raw === undefined ? null : `${IMPERSONATION_COOKIE_NAME}=${raw}`,
  );

  const isPlatformImpersonating =
    roles.includes("tenant_manager") &&
    sessionTenantId === "" &&
    impersonationTenantId !== null;

  const effectiveTenantId = isPlatformImpersonating ? impersonationTenantId : sessionTenantId;

  if (effectiveTenantId === "") {
    throw unauthorized();
  }

  return {
    userId: session.user.id,
    tenantId: effectiveTenantId,
    roles,
    isPlatformImpersonating,
  };
}

/**
 * Verify the current request is an authenticated PLATFORM admin — role
 * `tenant_manager` AND an empty `session.user.tenantId` (mirrors
 * `platformAdminProcedure` in server/trpc/middleware/require-platform-admin.ts).
 *
 * Deliberately distinct from `requireRouteAuth`: that helper REQUIRES a
 * resolved tenant context (session tenantId or impersonation) and throws
 * Unauthorized when both are empty — which would reject a pure-platform
 * session with no active impersonation. CMS media is GLOBAL, platform-admin-
 * only content (CMS_BUILD_PLAN.md — W3), so it needs the platform identity
 * check WITHOUT a tenant-context requirement.
 */
export async function requirePlatformAdminRouteAuth(): Promise<PlatformAdminRouteAuthContext> {
  const session = await auth();
  if (session === null || session.user.id === "") {
    throw unauthorized();
  }

  const roles = session.user.roles;
  const isPlatformAdmin = roles.includes("tenant_manager") && session.user.tenantId === "";
  if (!isPlatformAdmin) {
    throw forbidden();
  }

  return {
    userId: session.user.id,
    roles,
  };
}
