import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { matrixProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

export const observationRouter = router({
  list: matrixProcedure(tenantProcedure, "subjects", "view")
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        subjectId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.observation.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { recordedAt: "desc" },
        include: { subject: { select: { id: true, name: true, subjectType: true } } },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  getById: matrixProcedure(tenantProcedure, "subjects", "view")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.observation.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { subject: true },
      });
    }),
});
