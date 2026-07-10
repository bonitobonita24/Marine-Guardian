import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";
import { tenantProcedure } from "./tenant";
import { prisma } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import { hasPermission } from "../../../lib/rbac/has-permission";
import type { FeatureKey, FeatureAction } from "../../../lib/rbac/feature-registry";

type Role =
  | "tenant_manager"
  | "tenant_superadmin"
  | "field_coordinator"
  | "operator"
  | "viewer"
  | "tenant_admin";

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
export const adminProcedure = requireRole("tenant_manager", "tenant_superadmin", "tenant_admin");
export const coordinatorProcedure = requireRole(
  "tenant_manager",
  "tenant_superadmin",
  "field_coordinator",
  "tenant_admin",
);
export const operatorProcedure = requireRole(
  "tenant_manager",
  "tenant_superadmin",
  "field_coordinator",
  "operator",
  "tenant_admin",
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
  "tenant_manager",
  "tenant_superadmin",
  "field_coordinator",
  "viewer",
  "tenant_admin",
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
export const superAdminProcedure = requireRole("tenant_manager");

// userManagementProcedure (2026-07-10): WIDENED from a superAdminProcedure
// alias to its own gate — tenant_manager (platform) AND tenant_superadmin
// (the tenant's own owner). Rationale: the tenant owner (tenant_superadmin)
// must be able to manage its own tenant's users/roles without requiring a
// platform tenant_manager to do it for them. tenant_admin remains excluded —
// this is the same narrow carve-out documented on adminProcedure above (full
// access EXCEPT user management). Nav + route enforcement for /users and
// /settings lives in sidebar.tsx + middleware.ts (defense in depth) and has
// been widened to match (tenant_manager OR tenant_superadmin).
export const userManagementProcedure = requireRole("tenant_manager", "tenant_superadmin");

// billingProcedure (2026-07-10 scaffold): forward-looking gate for a future
// tenant billing/subscription surface. Same allow-list as
// userManagementProcedure (tenant_manager + tenant_superadmin — the tenant
// owner manages its own billing) — no consumers yet.
export const billingProcedure = requireRole("tenant_manager", "tenant_superadmin");

// matrixProcedure (tenant-rbac-standard §4 — custom-role permission matrix):
// chains a BASE enum procedure (tenantProcedure/adminProcedure/
// coordinatorProcedure/operatorProcedure/reportGenerateProcedure) with the
// authoritative DB-backed matrix resolver (has-permission.ts) for a single
// feature/action pair. The base argument is what actually enforces the
// existing enum-role gate (e.g. adminProcedure still rejects viewer/operator
// at the door); the matrix check layered on top of it is what makes a
// tenant's CUSTOM roles (below the fixed tiers) work. This composition is
// zero-regression for every fixed enum role: hasPermission returns true
// whenever ctx.customRoleId is null, so tenant_manager/tenant_superadmin/
// tenant_admin/field_coordinator/operator/viewer callers pass straight
// through unchanged and are governed exactly as before by the base
// procedure's own requireRole(...) gate. ONLY a user assigned a customRoleId
// is subject to the deny-by-default RolePermission matrix. Reserved features
// (users/settings/billing/profile) can never be granted via this path —
// hasPermission hard-clamps them regardless of base.
// Downstream routers wire this per-procedure, e.g.:
//   list: matrixProcedure(tenantProcedure, "events", "view").query(...)
//   create: matrixProcedure(adminProcedure, "events", "write").mutation(...)
// The four requireRole(...) gates (admin/coordinator/operator/reportGenerate)
// all share ONE structural type (the return of requireRole), so the union
// collapses to two genuinely-distinct members: tenantProcedure and any
// requireRole gate (represented by adminProcedure). All five real gates are
// assignable to this union at call sites.
type MatrixBaseProcedure = typeof tenantProcedure | typeof adminProcedure;

export function matrixProcedure(
  base: MatrixBaseProcedure,
  feature: FeatureKey,
  action: FeatureAction,
) {
  return base.use(async ({ ctx, next }) => {
    const allowed = await hasPermission(
      prisma as unknown as PrismaClient,
      { tenantId: ctx.tenantId, customRoleId: ctx.customRoleId },
      feature,
      action,
    );
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}
