import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

export const patrolAreaRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        patrolType: z.enum(["foot", "seabourn"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.patrolArea.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.patrolType !== undefined ? { patrolType: input.patrolType } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { name: "asc" },
        include: { creator: { select: { id: true, fullName: true } } },
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
      return prisma.patrolArea.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          creator: { select: { id: true, fullName: true } },
          schedules: {
            orderBy: { scheduledStart: "desc" },
            take: 20,
            include: { ranger: { select: { id: true, fullName: true } } },
          },
        },
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        patrolType: z.enum(["foot", "seabourn"]),
        polygonGeojson: z.record(z.unknown()),
        colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.patrolArea.create({
        data: {
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
          patrolType: input.patrolType,
          polygonGeojson: input.polygonGeojson,
          colorHex: input.colorHex,
          tenantId: ctx.tenantId,
          createdBy: ctx.userId,
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        polygonGeojson: z.record(z.unknown()).optional(),
        colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      return prisma.patrolArea.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.patrolArea.deleteMany({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
    }),
});
