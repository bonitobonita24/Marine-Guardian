import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

export const patrolScheduleRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        patrolAreaId: z.string().optional(),
        rangerUserId: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.patrolSchedule.findMany({
        where: {
          patrolArea: { tenantId: ctx.tenantId },
          ...(input.patrolAreaId !== undefined ? { patrolAreaId: input.patrolAreaId } : {}),
          ...(input.rangerUserId !== undefined ? { rangerUserId: input.rangerUserId } : {}),
          ...(input.from !== undefined ? { scheduledStart: { gte: input.from } } : {}),
          ...(input.to !== undefined ? { scheduledEnd: { lte: input.to } } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { scheduledStart: "asc" },
        include: {
          patrolArea: { select: { id: true, name: true, colorHex: true } },
          ranger: { select: { id: true, fullName: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  create: adminProcedure
    .input(
      z.object({
        patrolAreaId: z.string(),
        rangerUserId: z.string().optional(),
        rangerName: z.string().min(1).max(200),
        scheduledStart: z.date(),
        scheduledEnd: z.date(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.patrolSchedule.create({
        data: {
          patrolAreaId: input.patrolAreaId,
          ...(input.rangerUserId !== undefined ? { rangerUserId: input.rangerUserId } : {}),
          rangerName: input.rangerName,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          createdBy: ctx.userId,
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        rangerUserId: z.string().optional(),
        rangerName: z.string().min(1).max(200).optional(),
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      const schedule = await prisma.patrolSchedule.findFirst({
        where: { id },
        include: { patrolArea: { select: { tenantId: true } } },
      });
      if (!schedule || schedule.patrolArea.tenantId !== ctx.tenantId) {
        throw new Error("Not found");
      }
      return prisma.patrolSchedule.update({ where: { id }, data });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await prisma.patrolSchedule.findFirst({
        where: { id: input.id },
        include: { patrolArea: { select: { tenantId: true } } },
      });
      if (!schedule || schedule.patrolArea.tenantId !== ctx.tenantId) {
        throw new Error("Not found");
      }
      return prisma.patrolSchedule.delete({ where: { id: input.id } });
    }),
});
