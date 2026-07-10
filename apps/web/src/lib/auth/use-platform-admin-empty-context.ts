"use client";

// Task 4 — empty-state guidance for platform-level super_admin sessions.
//
// Webmaster + future platform admins have tenant_id = NULL in the database
// (marshalled as empty string via the Auth.js session callback in
// apps/web/src/server/auth/config.ts L102). Every tenant-scoped tRPC query
// (areaBoundary.list, patrol.list, user.list, etc.) returns zero rows for
// these users because L1 + L6 tenant scoping filters by ctx.tenantId.
//
// Without guidance, pickers render an unexplained empty dropdown. Smoke test
// S551 hit this on the Per Area Report area selector. This hook lets any
// tenant-scoped picker surface a single canonical message instead.

import { useSession } from "next-auth/react";

export const PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE =
  "You're signed in as a platform admin without a tenant context. Switch to a tenant to access tenant-scoped data.";

export function useIsPlatformAdminWithoutTenant(): boolean {
  const { data: session, status } = useSession();
  if (status !== "authenticated") return false;
  if (!session.user.roles.includes("tenant_manager")) return false;
  return session.user.tenantId === "";
}
