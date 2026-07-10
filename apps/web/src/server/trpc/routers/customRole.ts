import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { userManagementProcedure } from "../middleware/rbac";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import {
  isGrantableFeature,
  featureActions,
} from "../../../lib/rbac/feature-registry";

/**
 * customRoleRouter (tenant-rbac-standard §4 — custom-role permission matrix
 * management surface). Gated entirely by userManagementProcedure
 * (tenant_manager platform + tenant_superadmin tenant owner) — the same
 * gate as user.ts's admin surface. tenant_admin and below can never create,
 * edit, assign, or unassign a custom role; only the tenant owner (or a
 * platform tenant_manager) may.
 *
 * Every procedure is strictly tenant-scoped by ctx.tenantId — never trust a
 * client-sent tenantId. Cross-tenant lookups always resolve to NOT_FOUND,
 * never leak existence of another tenant's rows.
 */

const permissionInputSchema = z
  .object({
    featureKey: z.string().min(1),
    view: z.boolean(),
    write: z.boolean(),
    update: z.boolean(),
    delete: z.boolean(),
  })
  .strict();

type PermissionInput = z.infer<typeof permissionInputSchema>;

/**
 * Validates a proposed permission row against the feature registry:
 *   - the featureKey must be a grantable (non-reserved) feature
 *   - every action set to true must be one the feature actually exposes
 * Throws BAD_REQUEST on the first violation found.
 */
function assertValidPermission(permission: PermissionInput): void {
  if (!isGrantableFeature(permission.featureKey)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Feature "${permission.featureKey}" is not grantable via a custom role.`,
    });
  }

  const allowedActions = featureActions(permission.featureKey);
  const requestedActions: Array<{ action: "view" | "write" | "update" | "delete"; value: boolean }> = [
    { action: "view", value: permission.view },
    { action: "write", value: permission.write },
    { action: "update", value: permission.update },
    { action: "delete", value: permission.delete },
  ];

  for (const { action, value } of requestedActions) {
    if (value && !allowedActions.includes(action)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Feature "${permission.featureKey}" does not expose the "${action}" action.`,
      });
    }
  }
}

function assertValidPermissions(permissions: PermissionInput[]): void {
  for (const permission of permissions) {
    assertValidPermission(permission);
  }
}

export const customRoleRouter = router({
  list: userManagementProcedure.query(async ({ ctx }) => {
    const roles = await prisma.customRole.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      include: { permissions: true },
    });
    return { items: roles };
  }),

  getById: userManagementProcedure
    .input(z.object({ id: z.string() }).strict())
    .query(async ({ ctx, input }) => {
      const role = await prisma.customRole.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { permissions: true },
      });
      if (!role) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Custom role not found." });
      }
      return role;
    }),

  create: userManagementProcedure
    .input(
      z
        .object({
          name: z.string().min(1).max(60),
          description: z.string().max(500).optional(),
          permissions: z.array(permissionInputSchema),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertValidPermissions(input.permissions);

      const existing = await prisma.customRole.findFirst({
        where: { tenantId: ctx.tenantId, name: input.name },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A custom role with this name already exists.",
        });
      }

      const created = await prisma.$transaction(async (tx) => {
        const role = await tx.customRole.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            description: input.description ?? null,
          },
        });

        if (input.permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: input.permissions.map((permission) => ({
              tenantId: ctx.tenantId,
              customRoleId: role.id,
              featureKey: permission.featureKey,
              view: permission.view,
              write: permission.write,
              update: permission.update,
              delete: permission.delete,
            })),
          });
        }

        await writeAuditLog(tx as unknown as PrismaClient, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "CREATE_CUSTOM_ROLE",
          entityType: "CustomRole",
          entityId: role.id,
          changesJson: {
            after: { name: input.name, permissions: input.permissions },
          },
          ipAddress: ctx.ip,
        });

        return role;
      });

      return { id: created.id };
    }),

  update: userManagementProcedure
    .input(
      z
        .object({
          id: z.string(),
          name: z.string().min(1).max(60).optional(),
          description: z.string().max(500).optional(),
          permissions: z.array(permissionInputSchema).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.customRole.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, name: true, description: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Custom role not found." });
      }

      if (input.permissions !== undefined) {
        assertValidPermissions(input.permissions);
      }

      if (input.name !== undefined && input.name !== existing.name) {
        const nameConflict = await prisma.customRole.findFirst({
          where: { tenantId: ctx.tenantId, name: input.name, id: { not: input.id } },
          select: { id: true },
        });
        if (nameConflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A custom role with this name already exists.",
          });
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.customRole.update({
          where: { id: input.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        });

        if (input.permissions !== undefined) {
          // Replace the full permission set for this role in one atomic pass.
          await tx.rolePermission.deleteMany({ where: { customRoleId: input.id } });
          if (input.permissions.length > 0) {
            await tx.rolePermission.createMany({
              data: input.permissions.map((permission) => ({
                tenantId: ctx.tenantId,
                customRoleId: input.id,
                featureKey: permission.featureKey,
                view: permission.view,
                write: permission.write,
                update: permission.update,
                delete: permission.delete,
              })),
            });
          }
        }

        await writeAuditLog(tx as unknown as PrismaClient, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "UPDATE_CUSTOM_ROLE",
          entityType: "CustomRole",
          entityId: input.id,
          changesJson: {
            before: { name: existing.name, description: existing.description },
            after: {
              name: input.name ?? existing.name,
              description: input.description ?? existing.description,
              ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
            },
          },
          ipAddress: ctx.ip,
        });
      });

      return { id: input.id };
    }),

  delete: userManagementProcedure
    .input(z.object({ id: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.customRole.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Custom role not found." });
      }

      await prisma.customRole.delete({ where: { id: input.id } });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "DELETE_CUSTOM_ROLE",
        entityType: "CustomRole",
        entityId: input.id,
        changesJson: { before: { name: existing.name } },
        ipAddress: ctx.ip,
      });

      return { id: input.id };
    }),

  assignToUser: userManagementProcedure
    .input(z.object({ userId: z.string(), customRoleId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
      const targetUser = await prisma.user.findFirst({
        where: { id: input.userId, tenantId: ctx.tenantId },
        select: { id: true, role: true, customRoleId: true },
      });
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      const targetRole = await prisma.customRole.findFirst({
        where: { id: input.customRoleId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!targetRole) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Custom role not found." });
      }

      await prisma.user.update({
        where: { id: input.userId },
        data: {
          role: "tenant_admin",
          customRoleId: input.customRoleId,
          securityVersion: { increment: 1 },
        },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "ASSIGN_CUSTOM_ROLE",
        entityType: "User",
        entityId: input.userId,
        changesJson: {
          before: { role: targetUser.role, customRoleId: targetUser.customRoleId },
          after: { role: "tenant_admin", customRoleId: input.customRoleId },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.userId };
    }),

  unassign: userManagementProcedure
    .input(z.object({ userId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
      const targetUser = await prisma.user.findFirst({
        where: { id: input.userId, tenantId: ctx.tenantId },
        select: { id: true, role: true, customRoleId: true },
      });
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      await prisma.user.update({
        where: { id: input.userId },
        data: {
          customRoleId: null,
          securityVersion: { increment: 1 },
        },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "UNASSIGN_CUSTOM_ROLE",
        entityType: "User",
        entityId: input.userId,
        changesJson: {
          before: { customRoleId: targetUser.customRoleId },
          after: { customRoleId: null },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.userId };
    }),
});
