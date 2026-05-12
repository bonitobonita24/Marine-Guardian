import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

/**
 * Filter inputs shared between the list query and the /api/exports/events
 * Route Handler. Exported so the export endpoint validates with the same
 * Zod schema (single source of truth).
 */
export const eventListFilters = z.object({
  state: z.enum(["new_event", "active", "resolved"]).optional(),
  priority: z.number().int().min(0).max(3).optional(),
});

export const eventRouter = router({
  list: tenantProcedure
    .input(
      eventListFilters.extend({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: { eventType: { select: { display: true, category: true } } },
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
      return prisma.event.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          eventType: true,
          notifications: { take: 10, orderBy: { createdAt: "desc" } },
          accompanyingRangers: {
            include: { registeredUser: { select: { id: true, fullName: true } }, knownRanger: true },
          },
        },
      });
    }),

  updateState: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        state: z.enum(["new_event", "active", "resolved"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.event.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { state: input.state },
      });
    }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    const [total, newEvents, active, resolved] = await Promise.all([
      prisma.event.count({ where: { tenantId: ctx.tenantId } }),
      prisma.event.count({ where: { tenantId: ctx.tenantId, state: "new_event" } }),
      prisma.event.count({ where: { tenantId: ctx.tenantId, state: "active" } }),
      prisma.event.count({ where: { tenantId: ctx.tenantId, state: "resolved" } }),
    ]);
    return { total, newEvents, active, resolved };
  }),
});
