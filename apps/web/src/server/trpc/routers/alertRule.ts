import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import { alertRuleConditionSchema } from "@marine-guardian/shared/schemas";

export const alertRuleListFilters = z.object({
  isActive: z.boolean().optional(),
});

export const alertRuleRouter = router({
  list: tenantProcedure
    .input(
      alertRuleListFilters.extend({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.alertRule.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: { creator: { select: { id: true, fullName: true } } },
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
        name: z.string().min(1).max(200),
        // Validated against the canonical condition schema so the evaluator
        // will always receive a shape it understands.
        conditionJson: alertRuleConditionSchema,
        notificationChannels: z.array(z.enum(["in_app", "email"])).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.alertRule.create({
        data: {
          name: input.name,
          conditionJson: input.conditionJson,
          notificationChannels: input.notificationChannels,
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
        conditionJson: alertRuleConditionSchema.optional(),
        notificationChannels: z.array(z.enum(["in_app", "email"])).min(1).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      return prisma.alertRule.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.alertRule.deleteMany({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
    }),
});
