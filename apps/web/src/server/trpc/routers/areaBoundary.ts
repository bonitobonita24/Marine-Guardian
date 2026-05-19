import { z } from "zod";
import {
  createAreaBoundarySchema,
  updateAreaBoundarySchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

export const areaBoundaryRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        isEnabled: z.boolean().optional(),
        region: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.areaBoundary.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
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
      return prisma.areaBoundary.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { creator: { select: { id: true, fullName: true } } },
      });
    }),

  create: adminProcedure
    .input(createAreaBoundarySchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.areaBoundary.create({
        data: {
          name: input.name,
          aliases: input.aliases,
          region: input.region,
          source: input.source,
          geometryType: input.geometryType,
          geometryGeojson: input.geometryGeojson,
          isEnabled: input.isEnabled,
          overrideOfficial: input.overrideOfficial,
          ...(input.arcgisReferenceId !== null
            ? { arcgisReferenceId: input.arcgisReferenceId }
            : {}),
          tenantId: ctx.tenantId,
          createdByUserId: ctx.userId,
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({ id: z.string() }).merge(updateAreaBoundarySchema)
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      return prisma.areaBoundary.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.areaBoundary.deleteMany({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
    }),
});
