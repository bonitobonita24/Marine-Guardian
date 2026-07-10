import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { platformAdminProcedure } from "../middleware/require-platform-admin";
import { platformPrisma, writeAuditLog } from "@marine-guardian/db";

const BCRYPT_ROUNDS = 12;

const userRoleSchema = z.enum([
  "tenant_manager",
  "tenant_superadmin",
  "field_coordinator",
  "operator",
  "viewer",
  "tenant_admin",
]);

const languageSchema = z.enum(["en", "id", "ms"]);

export const platformUserRouter = router({
  list: platformAdminProcedure
    .input(
      z.object({
        tenantId: z.string().nullable().optional(),
        role: userRoleSchema.optional(),
        isActive: z.boolean().optional(),
        search: z.string().max(200).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const tenantFilter =
        input.tenantId === null
          ? { tenantId: null }
          : input.tenantId !== undefined
            ? { tenantId: input.tenantId }
            : {};

      const items = await platformPrisma.user.findMany({
        where: {
          ...tenantFilter,
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.search !== undefined
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
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          languagePreference: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          tenantId: true,
          tenant: {
            select: { name: true, slug: true },
          },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  create: platformAdminProcedure
    .input(
      z.object({
        email: z.string().email().max(255),
        fullName: z.string().min(1).max(255),
        role: userRoleSchema,
        tenantId: z.string().nullable(),
        languagePreference: languageSchema.default("en"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.role === "tenant_manager" && input.tenantId !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Super admin users must not be tenant-scoped.",
        });
      }
      if (input.role !== "tenant_manager" && input.tenantId === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Non-super-admin users must be assigned to a tenant.",
        });
      }

      if (input.tenantId !== null) {
        const tenant = await platformPrisma.tenant.findUnique({
          where: { id: input.tenantId },
          select: { id: true, isActive: true },
        });
        if (!tenant || !tenant.isActive) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tenant not found or inactive.",
          });
        }
      }

      const duplicate = await platformPrisma.user.findFirst({
        where: { email: input.email },
        select: { id: true },
      });
      if (duplicate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists.",
        });
      }

      const tempPassword = crypto.randomBytes(16).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      const user = await platformPrisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          role: input.role,
          tenantId: input.tenantId,
          languagePreference: input.languagePreference,
          passwordHash,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          tenantId: true,
          isActive: true,
          createdAt: true,
        },
      });

      await writeAuditLog(platformPrisma, {
        tenantId: input.tenantId,
        userId: ctx.userId,
        action: "PLATFORM:CREATE_USER",
        entityType: "User",
        entityId: user.id,
        changesJson: {
          after: {
            email: input.email,
            role: input.role,
            tenantId: input.tenantId,
            fullName: input.fullName,
          },
        },
        ipAddress: ctx.ip,
      });

      return { user, tempPassword };
    }),

  updateRole: platformAdminProcedure
    .input(
      z.object({
        id: z.string(),
        role: userRoleSchema,
        tenantId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await platformPrisma.user.findUnique({
        where: { id: input.id },
        select: { id: true, role: true, tenantId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      const effectiveTenantId =
        input.tenantId === undefined ? existing.tenantId : input.tenantId;

      if (input.role === "tenant_manager" && effectiveTenantId !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Super admin users must not be tenant-scoped.",
        });
      }
      if (input.role !== "tenant_manager" && effectiveTenantId === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Non-super-admin users must be assigned to a tenant.",
        });
      }

      if (
        input.tenantId !== undefined &&
        input.tenantId !== null &&
        input.tenantId !== existing.tenantId
      ) {
        const tenant = await platformPrisma.tenant.findUnique({
          where: { id: input.tenantId },
          select: { id: true, isActive: true },
        });
        if (!tenant || !tenant.isActive) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tenant not found or inactive.",
          });
        }
      }

      const tenantChanged =
        input.tenantId !== undefined && input.tenantId !== existing.tenantId;

      await platformPrisma.user.update({
        where: { id: input.id },
        data: {
          role: input.role,
          securityVersion: { increment: 1 },
          ...(tenantChanged ? { tenantId: input.tenantId as string | null } : {}),
        },
      });

      await writeAuditLog(platformPrisma, {
        tenantId: effectiveTenantId,
        userId: ctx.userId,
        action: "PLATFORM:UPDATE_USER_ROLE",
        entityType: "User",
        entityId: input.id,
        changesJson: {
          before: {
            role: existing.role,
            ...(tenantChanged ? { tenantId: existing.tenantId } : {}),
          },
          after: {
            role: input.role,
            ...(tenantChanged ? { tenantId: input.tenantId as string | null } : {}),
          },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id, role: input.role, tenantId: effectiveTenantId };
    }),

  deactivate: platformAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await platformPrisma.user.findUnique({
        where: { id: input.id },
        select: { id: true, tenantId: true, isActive: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      if (!user.isActive) {
        return { id: input.id, isActive: false };
      }

      await platformPrisma.user.update({
        where: { id: input.id },
        data: { isActive: false, securityVersion: { increment: 1 } },
      });

      await writeAuditLog(platformPrisma, {
        tenantId: user.tenantId,
        userId: ctx.userId,
        action: "PLATFORM:DEACTIVATE_USER",
        entityType: "User",
        entityId: input.id,
        changesJson: {
          before: { isActive: true },
          after: { isActive: false },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id, isActive: false };
    }),

  resetPassword: platformAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await platformPrisma.user.findUnique({
        where: { id: input.id },
        select: { id: true, tenantId: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      const tempPassword = crypto.randomBytes(16).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      await platformPrisma.user.update({
        where: { id: input.id },
        data: { passwordHash, securityVersion: { increment: 1 } },
      });

      await writeAuditLog(platformPrisma, {
        tenantId: user.tenantId,
        userId: ctx.userId,
        action: "PLATFORM:RESET_USER_PASSWORD",
        entityType: "User",
        entityId: input.id,
        changesJson: { note: "password reset" },
        ipAddress: ctx.ip,
      });

      return { tempPassword };
    }),

  // reassignTenantSuperadmin (2026-07-10): platform-level succession — a
  // tenant_manager reassigns which user holds tenant_superadmin for ANY
  // tenant, cross-tenant. Gated by platformAdminProcedure (tenant_manager +
  // platform context, same as every other mutation in this router). There is
  // no DB-level unique index enforcing one-superadmin-per-tenant; this
  // transaction enforces it logically by demoting the tenant's current
  // tenant_superadmin(s) in the same atomic write that promotes the target.
  // Self-service equivalent for the tenant owner itself is
  // user.transferOwnership (tenant-scoped, prisma, not platformPrisma).
  reassignTenantSuperadmin: platformAdminProcedure
    .input(
      z.object({
        tenantId: z.string(),
        newSuperadminUserId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenant = await platformPrisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, isActive: true },
      });
      if (!tenant || !tenant.isActive) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found or inactive.",
        });
      }

      const target = await platformPrisma.user.findFirst({
        where: { id: input.newSuperadminUserId, tenantId: input.tenantId },
        select: { id: true, role: true, isActive: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      if (!target.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot reassign ownership to a deactivated user.",
        });
      }

      const currentSuperadmins = await platformPrisma.user.findMany({
        where: {
          tenantId: input.tenantId,
          role: "tenant_superadmin",
          id: { not: target.id },
        },
        select: { id: true },
      });

      await platformPrisma.$transaction(async (tx) => {
        if (currentSuperadmins.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: currentSuperadmins.map((u) => u.id) } },
            data: { role: "tenant_admin", securityVersion: { increment: 1 } },
          });
        }
        await tx.user.update({
          where: { id: target.id },
          data: { role: "tenant_superadmin", securityVersion: { increment: 1 } },
        });

        await writeAuditLog(tx, {
          tenantId: input.tenantId,
          userId: ctx.userId,
          action: "PLATFORM:REASSIGN_TENANT_SUPERADMIN",
          entityType: "User",
          entityId: target.id,
          changesJson: {
            before: {
              demotedUserIds: currentSuperadmins.map((u) => u.id),
              targetRole: target.role,
            },
            after: { superadminUserId: target.id },
          },
          ipAddress: ctx.ip,
        });
      });

      return { id: target.id, tenantId: input.tenantId, role: "tenant_superadmin" as const };
    }),
});
