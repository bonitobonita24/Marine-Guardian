import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";

type Role =
  | "super_admin"
  | "site_admin"
  | "field_coordinator"
  | "operator"
  | "viewer"
  | "administrator";

export function requireRole(...allowedRoles: Role[]) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const hasRole = ctx.roles.some((r) => allowedRoles.includes(r as Role));
    if (!hasRole) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}

// administrator (2026-07-06): full-access role — everything super_admin/
// site_admin can do app-wide (adminProcedure/coordinatorProcedure/
// operatorProcedure/reportGenerateProcedure all include it below) with ONE
// deliberate carve-out: adding/managing user accounts. That narrow slice is
// gated separately by userManagementProcedure (below), which administrator
// is NEVER added to. Nav + route enforcement for the /users page lives in
// sidebar.tsx + middleware.ts (defense in depth, same pattern as viewer).
export const adminProcedure = requireRole("super_admin", "site_admin", "administrator");
export const coordinatorProcedure = requireRole(
  "super_admin",
  "site_admin",
  "field_coordinator",
  "administrator",
);
export const operatorProcedure = requireRole(
  "super_admin",
  "site_admin",
  "field_coordinator",
  "operator",
  "administrator",
);
// viewer is deliberately NEVER listed in adminProcedure/coordinatorProcedure/
// operatorProcedure above — it is a strictly read-only role and must be
// rejected by every mutation procedure gated by those three.
//
// reportGenerateProcedure (2026-07-06) is the ONE narrow, deliberate
// exception: viewer is allowed here ONLY because generating a printable
// report from the Interactive Report Map is an owner-approved,
// read-oriented "produce a PDF of what I can already see" action — it does
// not let a viewer create/modify/delete anything else. Do NOT reuse this
// procedure for any other mutation; every other write path stays on
// coordinatorProcedure/adminProcedure/operatorProcedure as before.
export const reportGenerateProcedure = requireRole(
  "super_admin",
  "site_admin",
  "field_coordinator",
  "viewer",
  "administrator",
);

// superAdminProcedure (2026-07-07): super_admin ONLY — the gate for BOTH
// (a) user-management mutations/reads (user.create, resetPassword,
// updateRole, deactivate, activate, list, getById) and (b) the Settings /
// tenant-config surface (ER connection + sync, report templates, breach
// register). site_admin was REMOVED here per owner 2026-07-07 (Users +
// Settings tightened to super_admin only); administrator remains excluded
// too. site_admin keeps every OTHER admin capability — it is still listed in
// adminProcedure/coordinatorProcedure/operatorProcedure/reportGenerateProcedure
// above; ONLY the Users + Settings surface is now super_admin-exclusive. Do
// NOT add site_admin or administrator to this procedure; do NOT reuse
// adminProcedure for user-management or settings/tenant-config mutations, or
// those roles silently regain access they are meant to be denied. Nav + route
// enforcement for /users and /settings lives in sidebar.tsx + middleware.ts
// (defense in depth).
export const superAdminProcedure = requireRole("super_admin");

// userManagementProcedure — historical name, kept as an alias so existing
// call sites (user.ts) don't need a mechanical rename. Refers to the exact
// same super_admin-only gate as superAdminProcedure above.
export const userManagementProcedure = superAdminProcedure;
