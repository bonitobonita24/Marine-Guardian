import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { matrixProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

/**
 * Doodle router — map annotation ("Doodle") backend foundation.
 *
 * Tenant-scoped, user-owned freehand map drawings saved over the Command
 * Center / Report Map surfaces. Gated under the EXISTING "exports" RBAC
 * feature key — no new feature key introduced (owner instruction).
 *
 * Scope: local/dev backend foundation only. No frontend wiring yet.
 */
export const doodleRouter = router({
  list: matrixProcedure(tenantProcedure, "exports", "view")
    .query(async ({ ctx }) => {
      return prisma.doodle.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          surface: true,
          createdAt: true,
          createdByUserId: true,
        },
      });
    }),

  get: matrixProcedure(tenantProcedure, "exports", "view")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await prisma.doodle.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return row;
    }),

  create: matrixProcedure(tenantProcedure, "exports", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        surface: z.enum(["command-center", "report-map"]),
        geometryJson: z.record(z.unknown()),
        viewJson: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.doodle.create({
        data: {
          tenantId: ctx.tenantId,
          createdByUserId: ctx.userId,
          name: input.name,
          surface: input.surface,
          geometryJson: input.geometryJson,
          ...(input.viewJson !== undefined ? { viewJson: input.viewJson } : {}),
        },
      });
    }),

  delete: matrixProcedure(tenantProcedure, "exports", "write")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await prisma.doodle.deleteMany({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { id: input.id };
    }),
});
