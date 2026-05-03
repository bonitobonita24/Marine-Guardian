import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

export const patrolRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        state: z.enum(["open", "done", "cancelled"]).optional(),
        patrolType: z.enum(["foot", "seabourn"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.patrol.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.patrolType !== undefined ? { patrolType: input.patrolType } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          segments: { select: { id: true, leaderName: true, actualStart: true, actualEnd: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  getById: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.patrol.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          segments: true,
          accompanyingRangers: {
            include: { registeredUser: { select: { id: true, fullName: true } }, knownRanger: true },
          },
        },
      });
    }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    const [total, open, done, cancelled] = await Promise.all([
      prisma.patrol.count({ where: { tenantId: ctx.tenantId } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, state: "open" } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, state: "done" } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, state: "cancelled" } }),
    ]);
    return { total, open, done, cancelled };
  }),
});
