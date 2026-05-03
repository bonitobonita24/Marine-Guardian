import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator";

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
