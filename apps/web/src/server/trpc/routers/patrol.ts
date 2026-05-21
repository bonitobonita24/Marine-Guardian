import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import { enqueuePatrolTrackMaterialize } from "@marine-guardian/jobs";

export const patrolListFilters = z.object({
  state: z.enum(["open", "done", "cancelled"]).optional(),
  patrolType: z.enum(["foot", "seaborne"]).optional(),
});

export const patrolRouter = router({
  list: tenantProcedure
    .input(
      patrolListFilters.extend({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.patrol.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.patrolType !== undefined ? { patrolType: input.patrolType } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          segments: { select: { id: true, leaderName: true, actualStart: true, actualEnd: true } },
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
      return prisma.patrol.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          segments: true,
          accompanyingRangers: {
            include: { registeredUser: { select: { id: true, fullName: true } }, knownRanger: true },
          },
        },
      });
    }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    const [total, open, done, cancelled] = await Promise.all([
      prisma.patrol.count({ where: { tenantId: ctx.tenantId } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, state: "open" } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, state: "done" } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, state: "cancelled" } }),
    ]);
    return { total, open, done, cancelled };
  }),

  // 5.2c — Admin manual rebuild of patrol GPS tracks. Re-fetches and
  // materializes the track for every state==='open' Patrol in the target
  // tenant by enqueuing one patrol-track-materialize job per active patrol.
  // Mirrors 5.1e areaBoundary.rebuild: site_admin rebuilds own tenant only
  // (PATROL_TRACK_REBUILD); super_admin may target any tenant (cross-tenant
  // gets PLATFORM:PATROL_TRACK_REBUILD prefix per security.md superadmin
  // convention). AuditLog entityId stores the target tenantId — the
  // operation targets the tenant's active-patrol universe, not a specific
  // patrol row. Closed patrols (state='done' or 'cancelled') are skipped
  // intentionally: their tracks are immutable after the patrol closed and
  // re-fetching wastes ER API quota. The queue jobId
  // (patrol-track-materialize:${tenantId}:${patrolId}) dedupes any race
  // between this admin trigger and other enqueue paths.
  rebuildTracks: adminProcedure
    .input(z.object({ tenantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const isSuperAdmin = ctx.roles.includes("super_admin");
      const targetTenantId = input.tenantId ?? ctx.tenantId;
      if (
        input.tenantId !== undefined &&
        input.tenantId !== ctx.tenantId &&
        !isSuperAdmin
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
      }
      const isCrossTenant = isSuperAdmin && targetTenantId !== ctx.tenantId;
      const action = isCrossTenant
        ? "PLATFORM:PATROL_TRACK_REBUILD"
        : "PATROL_TRACK_REBUILD";
      const patrols = await prisma.patrol.findMany({
        where: { tenantId: targetTenantId, state: "open" },
        select: { id: true },
      });
      await Promise.all(
        patrols.map((p) =>
          enqueuePatrolTrackMaterialize({
            patrolId: p.id,
            tenantId: targetTenantId,
            userId: ctx.userId,
          }),
        ),
      );
      await prisma.auditLog.create({
        data: {
          action,
          userId: ctx.userId,
          tenantId: targetTenantId,
          entityType: "Patrol",
          entityId: targetTenantId,
          changesJson: {
            enqueued: patrols.length,
            scope: isCrossTenant ? "platform" : "tenant",
          },
        },
      });
      return {
        tenantId: targetTenantId,
        enqueued: patrols.length,
        action,
      };
    }),
});
