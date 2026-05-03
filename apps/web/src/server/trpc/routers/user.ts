import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

export const userRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        role: z.enum(["super_admin", "site_admin", "field_coordinator", "operator"]).optional(),
        isActive: z.boolean().optional(),
        search: z.string().max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.user.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.search !== undefined && input.search !== ""
            ? {
                OR: [
                  { fullName: { contains: input.search, mode: "insensitive" } },
                  { email: { contains: input.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
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
      return prisma.user.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          languagePreference: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }),

  updateRole: adminProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.enum(["super_admin", "site_admin", "field_coordinator", "operator"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.user.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { role: input.role, securityVersion: { increment: 1 } },
      });
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.user.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { isActive: false, securityVersion: { increment: 1 } },
      });
    }),

  activate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.user.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { isActive: true, securityVersion: { increment: 1 } },
      });
    }),
});
