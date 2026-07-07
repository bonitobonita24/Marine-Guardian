import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { userManagementProcedure, superAdminProcedure } from "../middleware/rbac";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import { TRPCError } from "@trpc/server";

const BCRYPT_ROUNDS = 12;

const userRoleSchema = z.enum([
  "super_admin",
  "site_admin",
  "field_coordinator",
  "operator",
  "viewer",
  "administrator",
]);

export const userRouter = router({
  // create/resetPassword/updateRole/deactivate/activate/list/getById are all
  // gated to userManagementProcedure / superAdminProcedure (super_admin ONLY,
  // same alias — see rbac.ts) — site_admin was removed here per owner
  // 2026-07-07 (Users surface tightened to super_admin only) and
  // administrator remains excluded too. Do NOT switch these back to
  // adminProcedure or tenantProcedure.
  create: userManagementProcedure
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

  resetPassword: userManagementProcedure
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

  // list / getById (locked down 2026-07-06, tightened 2026-07-07): the full
  // user directory — email, role, lastLoginAt, timestamps — is now
  // super_admin ONLY. site_admin/administrator/field_coordinator/operator/
  // viewer get FORBIDDEN. Any non-admin surface that only needs an id+name
  // picker (e.g. the patrol schedule assignment dropdown) uses listActiveNames
  // below instead, which exposes no email/role/audit data and stays open to
  // every tenant member.
  list: superAdminProcedure
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

  getById: superAdminProcedure
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

  // listActiveNames (2026-07-06) — minimal-exposure alternative to `list`
  // for non-admin id+name pickers (e.g. the patrol-schedule assignment
  // dropdown, which only ever reads .id and .fullName). Open to every tenant
  // member (tenantProcedure) since it exposes no email/role/lastLoginAt.
  // Do NOT add fields here beyond id/fullName without re-checking whether
  // that data should stay behind superAdminProcedure instead.
  listActiveNames: tenantProcedure.query(async ({ ctx }) => {
    const items = await prisma.user.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    });
    return { items };
  }),

  updateRole: userManagementProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.enum([
          "super_admin",
          "site_admin",
          "field_coordinator",
          "operator",
          "viewer",
          "administrator",
        ]),
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

  deactivate: userManagementProcedure
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

  activate: userManagementProcedure
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

  // Command Center map municipality preference (2026-07-04) — per-user, scoped
  // strictly to the authenticated caller (ctx.userId), never a userId from
  // input. Persists the CC map's selected municipality filter so it restores
  // across refresh and re-login on any device.
  getCommandCenterMunicipality: tenantProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { commandCenterMunicipalityId: true },
    });
    return { municipalityId: user?.commandCenterMunicipalityId ?? null };
  }),

  setCommandCenterMunicipality: tenantProcedure
    .input(z.object({ municipalityId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { commandCenterMunicipalityId: input.municipalityId },
      });
      return { municipalityId: input.municipalityId };
    }),
});
