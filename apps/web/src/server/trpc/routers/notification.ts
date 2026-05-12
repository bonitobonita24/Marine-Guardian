import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

export const notificationRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        isRead: z.boolean().optional(),
        notificationType: z.enum(["critical", "warning", "info", "system"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.notification.findMany({
        where: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ...(input.isRead !== undefined ? { isRead: input.isRead } : {}),
          ...(input.notificationType !== undefined ? { notificationType: input.notificationType } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          event: { select: { id: true, title: true, state: true } },
          patrol: { select: { id: true, title: true, serialNumber: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  markRead: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.notification.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId, userId: ctx.userId },
        data: { isRead: true },
      });
    }),

  markAllRead: tenantProcedure.mutation(async ({ ctx }) => {
    return prisma.notification.updateMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, isRead: false },
      data: { isRead: true },
    });
  }),

  unreadCount: tenantProcedure.query(async ({ ctx }) => {
    return prisma.notification.count({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, isRead: false },
    });
  }),
});
