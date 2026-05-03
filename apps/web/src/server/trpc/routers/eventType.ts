import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

export const eventTypeRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        isActive: z.boolean().optional(),
        category: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return prisma.eventType.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
        },
        orderBy: { display: "asc" },
      });
    }),

  getById: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.eventType.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { _count: { select: { events: true } } },
      });
    }),
});
