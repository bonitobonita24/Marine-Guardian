import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";

/**
 * Platform admin gate. Requires:
 *  - super_admin role
 *  - empty tenantId on the session (platform-level user, not tenant-scoped).
 *    Auth marshals null tenantId → "" so the session type is always string.
 * Use ONLY for /admin platform routes that bypass tenant isolation via platformPrisma.
 */
export const platformAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const isSuperAdmin = ctx.roles.includes("super_admin");
  const isPlatformContext = ctx.tenantId === "";
  if (!isSuperAdmin || !isPlatformContext) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
