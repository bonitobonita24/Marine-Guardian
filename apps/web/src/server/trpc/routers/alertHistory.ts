import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

export const alertHistoryRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        alertRuleId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.alertHistory.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.alertRuleId !== undefined ? { alertRuleId: input.alertRuleId } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { firedAt: "desc" },
        include: {
          alertRule: { select: { id: true, name: true } },
          event: { select: { id: true, title: true, serialNumber: true, state: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),
});
