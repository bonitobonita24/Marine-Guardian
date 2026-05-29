import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { platformAdminProcedure } from "../middleware/require-platform-admin";
import { platformPrisma, writeAuditLog } from "@marine-guardian/db";

const thirtyDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
};

export const platformRouter = router({
  list: platformAdminProcedure.query(async () => {
    const tenants = await platformPrisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        earthrangerUrl: true,
        currency: true,
        timezone: true,
        createdAt: true,
        _count: {
          select: { users: true },
        },
      },
    });

    const cutoff = thirtyDaysAgo();

    const eventCounts = await Promise.all(
      tenants.map((t) =>
        platformPrisma.event.count({
          where: { tenantId: t.id, createdAt: { gte: cutoff } },
        }),
      ),
    );

    return tenants.map((t, i) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isActive: t.isActive,
      earthrangerUrl: t.earthrangerUrl,
      currency: t.currency,
      timezone: t.timezone,
      createdAt: t.createdAt,
      userCount: t._count.users,
      eventCount30d: eventCounts[i] ?? 0,
    }));
  }),

  metrics: platformAdminProcedure.query(async () => {
    const [totalTenants, totalUsers, totalEvents] = await Promise.all([
      platformPrisma.tenant.count(),
      platformPrisma.user.count(),
      platformPrisma.event.count(),
    ]);
    return { totalTenants, totalUsers, totalEvents };
  }),

  create: platformAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
            message:
              "Slug must be lowercase letters, digits, or hyphens and cannot start or end with a hyphen.",
          }),
        timezone: z.string().optional().default("UTC"),
        currency: z.string().optional().default("IDR"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await platformPrisma.tenant.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A tenant with that slug already exists.",
        });
      }

      const tenant = await platformPrisma.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          timezone: input.timezone,
          currency: input.currency,
          isActive: true,
        },
      });

      await writeAuditLog(platformPrisma, {
        tenantId: null,
        userId: ctx.userId,
        action: "PLATFORM:CREATE_TENANT",
        entityType: "Tenant",
        entityId: tenant.id,
        changesJson: {
          after: {
            name: input.name,
            slug: input.slug,
            timezone: input.timezone,
            currency: input.currency,
          },
        },
        ipAddress: ctx.ip,
      });

      return tenant;
    }),

  update: platformAdminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1).max(255).optional(),
        timezone: z.string().optional(),
        currency: z.string().optional(),
        syncFrequencySeconds: z.number().int().min(30).max(86400).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await platformPrisma.tenant.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const updateData: {
        name?: string;
        timezone?: string;
        currency?: string;
        syncFrequencySeconds?: number;
      } = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.timezone !== undefined) updateData.timezone = input.timezone;
      if (input.currency !== undefined) updateData.currency = input.currency;
      if (input.syncFrequencySeconds !== undefined)
        updateData.syncFrequencySeconds = input.syncFrequencySeconds;

      const updated = await platformPrisma.tenant.update({
        where: { id: input.id },
        data: updateData,
      });

      await writeAuditLog(platformPrisma, {
        tenantId: null,
        userId: ctx.userId,
        action: "PLATFORM:UPDATE_TENANT",
        entityType: "Tenant",
        entityId: input.id,
        changesJson: {
          before: {
            name: existing.name,
            timezone: existing.timezone,
            currency: existing.currency,
            syncFrequencySeconds: existing.syncFrequencySeconds,
          },
          after: updateData,
        },
        ipAddress: ctx.ip,
      });

      return updated;
    }),

  deactivate: platformAdminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await platformPrisma.tenant.findUnique({
        where: { id: input.id },
        select: { id: true, isActive: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (!existing.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant already deactivated.",
        });
      }

      await platformPrisma.tenant.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      await writeAuditLog(platformPrisma, {
        tenantId: null,
        userId: ctx.userId,
        action: "PLATFORM:DEACTIVATE_TENANT",
        entityType: "Tenant",
        entityId: input.id,
        changesJson: {
          before: { isActive: true },
          after: { isActive: false },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id, isActive: false };
    }),
});
