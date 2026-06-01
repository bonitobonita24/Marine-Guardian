import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import { TRPCError } from "@trpc/server";

const BCRYPT_ROUNDS = 12;

const userRoleSchema = z.enum(["super_admin", "site_admin", "field_coordinator", "operator"]);

export const userRouter = router({
  create: adminProcedure
    .input(
      z.object({
        email: z.string().email().max(255),
        fullName: z.string().min(1).max(255),
        role: userRoleSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate email within tenant
      const existing = await prisma.user.findFirst({
        where: { email: input.email, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists.",
        });
      }

      const tempPassword = crypto.randomBytes(16).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          role: input.role,
          tenantId: ctx.tenantId,
          passwordHash,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      return { user, tempPassword };
    }),

  resetPassword: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tempPassword = crypto.randomBytes(16).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      const result = await prisma.user.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: {
          passwordHash,
          securityVersion: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }

      return { tempPassword };
    }),

  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        role: userRoleSchema.optional(),
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
      const existing = await prisma.user.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, role: true, tenantId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      await prisma.user.update({
        where: { id: input.id },
        data: { role: input.role, securityVersion: { increment: 1 } },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "UPDATE_USER_ROLE",
        entityType: "User",
        entityId: input.id,
        changesJson: {
          before: { role: existing.role },
          after: { role: input.role },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id };
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.user.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, isActive: true, tenantId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      await prisma.user.update({
        where: { id: input.id },
        data: { isActive: false, securityVersion: { increment: 1 } },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "DEACTIVATE_USER",
        entityType: "User",
        entityId: input.id,
        changesJson: {
          before: { isActive: existing.isActive },
          after: { isActive: false },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id };
    }),

  activate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.user.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, isActive: true, tenantId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      await prisma.user.update({
        where: { id: input.id },
        data: { isActive: true, securityVersion: { increment: 1 } },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "ACTIVATE_USER",
        entityType: "User",
        entityId: input.id,
        changesJson: {
          before: { isActive: existing.isActive },
          after: { isActive: true },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id };
    }),
});
