import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { rateLimiters } from "../lib/rate-limit";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure.use(async ({ ctx, next }) => {
  const ip = ctx.ip;
  rateLimiters.public.check(ip);
  return next({ ctx });
});

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const token = ctx.session.user.id;
  rateLimiters.api.check(token);
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id,
      tenantId: ctx.session.user.tenantId,
      roles: ctx.session.user.roles,
    },
  });
});
