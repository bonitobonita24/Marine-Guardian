import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator" | "viewer";

export function requireRole(...allowedRoles: Role[]) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const hasRole = ctx.roles.some((r) => allowedRoles.includes(r as Role));
    if (!hasRole) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}

export const adminProcedure = requireRole("super_admin", "site_admin");
export const coordinatorProcedure = requireRole("super_admin", "site_admin", "field_coordinator");
export const operatorProcedure = requireRole("super_admin", "site_admin", "field_coordinator", "operator");
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
);
