import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

export const syncLogRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        syncType: z.enum(["events", "subjects", "patrols", "observations", "event_types"]).optional(),
        status: z.enum(["success", "failed", "partial"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.syncLog.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.syncType !== undefined ? { syncType: input.syncType } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { startedAt: "desc" },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  latest: tenantProcedure.query(async ({ ctx }) => {
    return prisma.syncLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { startedAt: "desc" },
      take: 5,
    });
  }),
});
