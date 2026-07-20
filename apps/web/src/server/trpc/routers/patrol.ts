import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure, matrixProcedure } from "../middleware/rbac";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import { Prisma } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import { enqueuePatrolTrackMaterialize, enqueueMunicipalityAssign } from "@marine-guardian/jobs";

/**
 * The set of patrol fields that are locally editable.
 * Any field in this set that has a PatrolRevision row is considered
 * "locally edited" — the er-sync processor will skip overwriting it.
 */
export const PATROL_EDITABLE_FIELDS = [
  "title",
  "boatName",
  "areaName",
] as const;

export type PatrolEditableField = (typeof PATROL_EDITABLE_FIELDS)[number];

export const patrolListFilters = z.object({
  state: z.enum(["open", "done", "cancelled"]).optional(),
  patrolType: z.enum(["foot", "seaborne"]).optional(),
  // v2 spec L119: exclude test patrols by default (set includeTest=true to include)
  includeTest: z.boolean().default(false),
  // Phase 7 soft-delete: exclude soft-deleted patrols by default. Admin "Show
  // Deleted" UI sets includeDeleted=true to surface deleted rows for restore.
  includeDeleted: z.boolean().default(false),
});

export const patrolRouter = router({
  list: matrixProcedure(tenantProcedure, "patrols", "view")
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
          // v2 spec L119: exclude test patrols by default (set includeTest=true to include)
          ...(input.includeTest ? {} : { isTestPatrol: false }),
          // Phase 7 soft-delete: exclude soft-deleted patrols by default
          ...(input.includeDeleted ? {} : { isDeleted: false }),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          segments: { select: { id: true, leaderName: true, actualStart: true, actualEnd: true } },
          municipality: { select: { id: true, name: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  getById: matrixProcedure(tenantProcedure, "patrols", "view")
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

  // Phase 7 soft-delete: stats are operator-facing — deleted patrols never
  // count toward any tile, so isDeleted:false is always applied (no toggle).
  stats: matrixProcedure(tenantProcedure, "patrols", "view").query(async ({ ctx }) => {
    const [total, open, done, cancelled] = await Promise.all([
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, isDeleted: false } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, isDeleted: false, state: "open" } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, isDeleted: false, state: "done" } }),
      prisma.patrol.count({ where: { tenantId: ctx.tenantId, isDeleted: false, state: "cancelled" } }),
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
  // (patrol-track-materialize__${tenantId}__${patrolId}) dedupes any race
  // between this admin trigger and other enqueue paths.
  rebuildTracks: matrixProcedure(adminProcedure, "patrols", "update")
    .input(z.object({ tenantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const isSuperAdmin = ctx.roles.includes("tenant_manager");
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

  // Phase 7 soft-delete — operator-triggered soft delete of a Patrol row.
  // adminProcedure (super_admin + site_admin) per security.md Option B template /
  // 652d33d updateRole hardening: findFirst tenant-scoped → throw NOT_FOUND with
  // the SAME message for missing vs cross-tenant (enumeration-leak guard) →
  // reject double-delete (BAD_REQUEST) → set isDeleted/deletedAt → writeAuditLog.
  // DEVIATION: scope requested severity='medium', but the deployed Severity enum
  // is {info,warning,high,critical} (no 'medium'). A recoverable destructive op
  // maps to 'warning'. Read paths are intentionally NOT filtered here (handled
  // in the dependent read-filter session S2).
  softDelete: matrixProcedure(adminProcedure, "patrols", "delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.patrol.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, isDeleted: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Patrol not found." });
      }
      if (existing.isDeleted) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Patrol already deleted.",
        });
      }

      const deletedAt = new Date();
      await prisma.patrol.update({
        where: { id: input.id },
        data: { isDeleted: true, deletedAt },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "DELETE_PATROL",
        entityType: "Patrol",
        entityId: input.id,
        severity: "warning",
        changesJson: {
          before: { isDeleted: false, deletedAt: null },
          after: { isDeleted: true, deletedAt: deletedAt.toISOString() },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id };
    }),

  /**
   * Update locally-editable fields of a Patrol (q-ops-02).
   *
   * Security: tenantProcedure (all authenticated tenant members may edit — same
   * gate as event.update; admins/coordinators/operators can all update). L5-audited.
   * L6 tenant-scoped: findFirst enforces tenantId match.
   *
   * Editable fields: title, boatName, areaName.
   * Writes an append-only PatrolRevision row per changed field (q-ops-04).
   * erOriginalSnapshot is never touched.
   */
  update: matrixProcedure(tenantProcedure, "patrols", "update")
    .input(
      z
        .object({
          id: z.string(),
          // BUG-2b FIX: title must be non-empty when provided — reject blank-
          // wipe attempts.  boatName and areaName remain freely clearable
          // (genuinely optional in the domain).
          title: z.string().trim().min(1, "Title is required").max(500).optional(),
          boatName: z.string().max(200).optional(),
          areaName: z.string().max(300).optional(),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.patrol.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          title: true,
          boatName: true,
          areaName: true,
        },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Patrol not found." });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.boatName !== undefined) data.boatName = input.boatName;
      if (input.areaName !== undefined) data.areaName = input.areaName;

      if (Object.keys(data).length === 0) {
        return existing;
      }

      const before: Record<string, Prisma.JsonValue> = {};
      const after: Record<string, Prisma.JsonValue> = {};
      const scalarKeys = ["title", "boatName", "areaName"] as const;
      for (const key of scalarKeys) {
        if (input[key] !== undefined && input[key] !== existing[key]) {
          before[key] = existing[key] ?? null;
          after[key] = input[key] ?? null;
        }
      }

      // Build revision rows for each changed field (q-ops-04 append-only).
      const revisionRows: {
        tenantId: string;
        patrolId: string;
        userId: string;
        fieldName: string;
        beforeJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
        afterJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      }[] = [];
      for (const key of Object.keys(before)) {
        revisionRows.push({
          tenantId: ctx.tenantId,
          patrolId: input.id,
          userId: ctx.userId,
          fieldName: key,
          beforeJson: before[key] === null ? Prisma.JsonNull : (before[key] as Prisma.InputJsonValue),
          afterJson: after[key] === null ? Prisma.JsonNull : (after[key] as Prisma.InputJsonValue),
        });
      }

      const updated = await prisma.patrol.update({
        where: { id: input.id },
        data,
        include: {
          segments: true,
          accompanyingRangers: {
            include: {
              registeredUser: { select: { id: true, fullName: true } },
              knownRanger: true,
            },
          },
        },
      });

      // Write append-only revision rows (q-ops-04).
      if (revisionRows.length > 0) {
        await prisma.patrolRevision.createMany({ data: revisionRows });
      }

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "UPDATE_PATROL",
        entityType: "Patrol",
        entityId: input.id,
        changesJson: { before, after },
        ipAddress: ctx.ip,
        severity: "info",
      });

      return updated;
    }),

  /**
   * Manual per-patrol municipality override (Task 3 — anti-clobber flag).
   *
   * Setting a municipality marks municipalityManual=true so the async
   * municipality-assign processor skips overwriting it going forward.
   * Clearing (municipalityId: null) reverts to auto-attribution and
   * re-enqueues the job to recompute the geometry-derived value.
   *
   * Security: tenant-scoped (L6); matrix-gated same as `update`.
   */
  setMunicipalityOverride: matrixProcedure(tenantProcedure, "patrols", "update")
    .input(
      z
        .object({
          id: z.string(),
          municipalityId: z.string().nullable(),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.patrol.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, municipalityId: true, municipalityManual: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Patrol not found." });
      }

      if (input.municipalityId !== null) {
        const municipality = await prisma.municipality.findFirst({
          where: { id: input.municipalityId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!municipality) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Municipality not found." });
        }

        await prisma.patrol.update({
          where: { id: input.id },
          data: {
            municipalityId: input.municipalityId,
            municipalityManual: true,
            municipalityAssignedAt: new Date(),
          },
        });

        await writeAuditLog(prisma as unknown as PrismaClient, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "SET_PATROL_MUNICIPALITY_OVERRIDE",
          entityType: "Patrol",
          entityId: input.id,
          changesJson: {
            before: { municipalityId: existing.municipalityId, municipalityManual: existing.municipalityManual },
            after: { municipalityId: input.municipalityId, municipalityManual: true },
          },
          ipAddress: ctx.ip,
          severity: "info",
        });
      } else {
        await prisma.patrol.update({
          where: { id: input.id },
          data: { municipalityManual: false },
        });

        await enqueueMunicipalityAssign({
          entity: "patrol",
          id: input.id,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        });

        await writeAuditLog(prisma as unknown as PrismaClient, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "CLEAR_PATROL_MUNICIPALITY_OVERRIDE",
          entityType: "Patrol",
          entityId: input.id,
          changesJson: {
            before: { municipalityId: existing.municipalityId, municipalityManual: existing.municipalityManual },
            after: { municipalityId: null, municipalityManual: false },
          },
          ipAddress: ctx.ip,
          severity: "info",
        });
      }

      return {
        id: input.id,
        municipalityId: input.municipalityId,
        municipalityManual: input.municipalityId !== null,
      };
    }),

  /**
   * Manual per-patrol start/end time override (anti-clobber flags).
   *
   * WHY: the ER mobile app frequently fails to capture the phone's date/time,
   * so ER supplies no `start_time` for a large slice of patrols (overwhelmingly
   * `foot` patrols). Only a minority are derivable from patrol_segments, so for
   * the rest an officer-supplied value is the ONLY way the patrol ever gets a
   * time — and that correction must survive every subsequent ER sync.
   *
   * Setting a time marks the corresponding `*Manual` flag true; the er-sync
   * processor excludes flagged fields from its update payload (same
   * choke-point pattern as `municipalityManual`). Clearing (null) drops the
   * value AND the flag, handing the field back to ER/derivation.
   *
   * NOTE — no re-derive job is enqueued on clear, unlike
   * `setMunicipalityOverride`. Start-time derivation from
   * patrol_segments.actual_start currently lives ONLY in the one-off
   * `scripts/backfill-patrol-start-time.ts`; there is no queue/processor
   * counterpart to enqueue. Once one exists, enqueue it here on the
   * clear path.
   *
   * Security: tenant-scoped (L6); matrix-gated same as `update`.
   */
  setTimeOverride: matrixProcedure(tenantProcedure, "patrols", "update")
    .input(
      z
        .object({
          id: z.string(),
          startTime: z.coerce.date().nullable(),
          endTime: z.coerce.date().nullable(),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.patrol.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          startTimeManual: true,
          endTimeManual: true,
          startTimeDerivedAt: true,
        },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Patrol not found." });
      }

      if (
        input.startTime !== null &&
        input.endTime !== null &&
        input.endTime.getTime() < input.startTime.getTime()
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be on or after start time.",
        });
      }

      // Setting a value flags it manual. Clearing drops the value AND the
      // flag, so ER/derivation may repopulate it. `startTimeDerivedAt` is
      // provenance for a DERIVED value — a manual set supersedes it, and a
      // clear invalidates it, so it is nulled on both paths.
      const data = {
        startTime: input.startTime,
        startTimeManual: input.startTime !== null,
        startTimeDerivedAt: null,
        endTime: input.endTime,
        endTimeManual: input.endTime !== null,
      };

      await prisma.patrol.update({ where: { id: input.id }, data });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "SET_PATROL_TIME_OVERRIDE",
        entityType: "Patrol",
        entityId: input.id,
        changesJson: {
          before: {
            startTime: existing.startTime,
            endTime: existing.endTime,
            startTimeManual: existing.startTimeManual,
            endTimeManual: existing.endTimeManual,
            startTimeDerivedAt: existing.startTimeDerivedAt,
          },
          after: data,
        },
        ipAddress: ctx.ip,
        severity: "info",
      });

      return {
        id: input.id,
        startTime: input.startTime,
        endTime: input.endTime,
        startTimeManual: data.startTimeManual,
        endTimeManual: data.endTimeManual,
      };
    }),

  /**
   * Fetch the edit-history revision timeline for a single patrol (q-ops-04).
   *
   * Returns revisions NEWEST-FIRST plus the immutable erOriginalSnapshot as
   * the synthetic "first" baseline entry (oldest position in the timeline).
   *
   * Security: tenant-scoped (L6).
   */
  getRevisions: matrixProcedure(tenantProcedure, "patrols", "view")
    .input(z.object({ patrolId: z.string() }))
    .query(async ({ ctx, input }) => {
      const patrol = await prisma.patrol.findFirst({
        where: { id: input.patrolId, tenantId: ctx.tenantId },
        select: { id: true, erOriginalSnapshot: true, syncedAt: true },
      });
      if (!patrol) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Patrol not found." });
      }

      const revisions = await prisma.patrolRevision.findMany({
        where: { tenantId: ctx.tenantId, patrolId: input.patrolId },
        orderBy: { createdAt: "desc" },
      });

      const userIds = [...new Set(revisions.map((r) => r.userId))];
      const users =
        userIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, fullName: true, email: true },
            })
          : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      const revisionList = revisions.map((r) => ({
        id: r.id,
        fieldName: r.fieldName,
        beforeJson: r.beforeJson,
        afterJson: r.afterJson,
        createdAt: r.createdAt,
        editor: userMap.get(r.userId) ?? { id: r.userId, fullName: null, email: null },
      }));

      return {
        revisions: revisionList,
        erOriginalSnapshot: patrol.erOriginalSnapshot,
        erSyncedAt: patrol.syncedAt,
      };
    }),

  /**
   * Returns the set of field names that have been locally edited for a patrol.
   * Used by the er-sync processor to skip overwriting locally-edited fields (q-ops conflict rule).
   */
  getEditedFields: matrixProcedure(tenantProcedure, "patrols", "view")
    .input(z.object({ patrolId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await prisma.patrolRevision.findMany({
        where: { tenantId: ctx.tenantId, patrolId: input.patrolId },
        select: { fieldName: true },
        distinct: ["fieldName"],
      });
      return { editedFields: rows.map((r) => r.fieldName) };
    }),

  // Phase 7 soft-delete — mirror of softDelete: restore a previously
  // soft-deleted Patrol. Rejects (BAD_REQUEST) when the row is not currently
  // deleted. Same NOT_FOUND enumeration-leak guard as softDelete.
  restore: matrixProcedure(adminProcedure, "patrols", "update")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.patrol.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, isDeleted: true, deletedAt: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Patrol not found." });
      }
      if (!existing.isDeleted) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Patrol not deleted.",
        });
      }

      await prisma.patrol.update({
        where: { id: input.id },
        data: { isDeleted: false, deletedAt: null },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "RESTORE_PATROL",
        entityType: "Patrol",
        entityId: input.id,
        severity: "warning",
        changesJson: {
          before: {
            isDeleted: true,
            deletedAt: existing.deletedAt?.toISOString() ?? null,
          },
          after: { isDeleted: false, deletedAt: null },
        },
        ipAddress: ctx.ip,
      });

      return { id: input.id };
    }),
});
