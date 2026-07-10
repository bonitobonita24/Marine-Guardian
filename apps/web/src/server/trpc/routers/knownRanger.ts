import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure, matrixProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

export const knownRangerRouter = router({
  list: matrixProcedure(tenantProcedure, "events", "view")
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        search: z.string().max(200).optional(),
        source: z.enum(["earthranger_sync", "manual_entry"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.knownRanger.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.search !== undefined && input.search !== ""
            ? { name: { contains: input.search, mode: "insensitive" } }
            : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { name: "asc" },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  create: matrixProcedure(adminProcedure, "events", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.knownRanger.create({
        data: {
          name: input.name,
          source: "manual_entry",
          tenantId: ctx.tenantId,
        },
      });
    }),

  deactivate: matrixProcedure(adminProcedure, "events", "delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.knownRanger.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { isActive: false },
      });
    }),
});
