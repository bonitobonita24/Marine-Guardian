import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

export const subjectRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        search: z.string().max(200).optional(),
        groupId: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.subject.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.search !== undefined ? { name: { contains: input.search, mode: "insensitive" } } : {}),
          ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { name: "asc" },
        include: { group: { select: { id: true, name: true } } },
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
      return prisma.subject.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          group: true,
          observations: { take: 50, orderBy: { recordedAt: "desc" } },
        },
      });
    }),

  groups: tenantProcedure.query(async ({ ctx }) => {
    return prisma.subjectGroup.findMany({
      where: { tenantId: ctx.tenantId, isVisible: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { subjects: true } } },
    });
  }),
});
