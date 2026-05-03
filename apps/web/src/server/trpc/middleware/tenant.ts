import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";

export const tenantProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId,
    },
  });
});
