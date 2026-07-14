import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { coordinatorProcedure, matrixProcedure } from "../middleware/rbac";
import { prisma, writeAuditLog, PatrolScheduleStatus } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";

const accompanyingRangerSchema = z.object({
  userId: z.string().optional(),
  name: z.string().min(1).max(200),
});

// Derive the effective scheduledEnd from scheduledStart + plannedHours when
// plannedHours is provided; otherwise fall back to an explicit scheduledEnd.
function deriveScheduledEnd(
  start: Date,
  plannedHours: number | undefined,
  explicitEnd: Date | undefined,
): Date | undefined {
  if (plannedHours !== undefined) {
    return new Date(start.getTime() + plannedHours * 3600 * 1000);
  }
  return explicitEnd;
}

// Half-open interval overlap: A.start < B.end AND B.start < A.end
async function findOverlappingSchedules(
  tenantId: string,
  rangerUserId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  return prisma.patrolSchedule.findMany({
    where: {
      tenantId,
      rangerUserId,
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      scheduledStart: { lt: end },
      scheduledEnd: { gt: start },
    },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      rangerName: true,
      patrolArea: { select: { id: true, name: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });
}

export const patrolScheduleRouter = router({
  list: matrixProcedure(tenantProcedure, "patrol-schedule", "view")
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        patrolAreaId: z.string().optional(),
        rangerUserId: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.patrolSchedule.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.patrolAreaId !== undefined ? { patrolAreaId: input.patrolAreaId } : {}),
          ...(input.rangerUserId !== undefined ? { rangerUserId: input.rangerUserId } : {}),
          ...(input.from !== undefined ? { scheduledStart: { gte: input.from } } : {}),
          ...(input.to !== undefined ? { scheduledEnd: { lte: input.to } } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { scheduledStart: "asc" },
        include: {
          patrolArea: { select: { id: true, name: true, colorHex: true } },
          ranger: { select: { id: true, fullName: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  checkConflicts: matrixProcedure(tenantProcedure, "patrol-schedule", "view")
    .input(
      z.object({
        rangerUserId: z.string().optional(),
        scheduledStart: z.date(),
        scheduledEnd: z.date(),
        excludeId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.rangerUserId === undefined) {
        return { conflicts: [] };
      }
      const conflicts = await findOverlappingSchedules(
        ctx.tenantId,
        input.rangerUserId,
        input.scheduledStart,
        input.scheduledEnd,
        input.excludeId,
      );
      return { conflicts };
    }),

  create: matrixProcedure(coordinatorProcedure, "patrol-schedule", "write")
    .input(
      z.object({
        patrolAreaId: z.string().optional(),
        rangerUserId: z.string().optional(),
        rangerName: z.string().min(1).max(200),
        accompanyingRangers: z.array(accompanyingRangerSchema).optional(),
        scheduledStart: z.date(),
        scheduledEnd: z.date().optional(),
        plannedHours: z.number().positive().max(1000).optional(),
        plannedTrackGeojson: z.record(z.any()).optional(),
        status: z.nativeEnum(PatrolScheduleStatus).optional(),
        notes: z.string().max(2000).optional(),
        overrideConflicts: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const effectiveEnd = deriveScheduledEnd(
        input.scheduledStart,
        input.plannedHours,
        input.scheduledEnd,
      );
      if (effectiveEnd === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either scheduledEnd or plannedHours is required",
        });
      }
      if (input.rangerUserId !== undefined && !input.overrideConflicts) {
        const conflicts = await findOverlappingSchedules(
          ctx.tenantId,
          input.rangerUserId,
          input.scheduledStart,
          effectiveEnd,
        );
        if (conflicts.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ranger has overlapping assignments",
            cause: { conflictingSchedules: conflicts },
          });
        }
      }
      const createData = {
        tenantId: ctx.tenantId,
        ...(input.patrolAreaId !== undefined ? { patrolAreaId: input.patrolAreaId } : {}),
        ...(input.rangerUserId !== undefined ? { rangerUserId: input.rangerUserId } : {}),
        rangerName: input.rangerName,
        ...(input.accompanyingRangers !== undefined
          ? { accompanyingRangers: input.accompanyingRangers }
          : {}),
        scheduledStart: input.scheduledStart,
        scheduledEnd: effectiveEnd,
        ...(input.plannedHours !== undefined ? { plannedHours: input.plannedHours } : {}),
        ...(input.plannedTrackGeojson !== undefined
          ? { plannedTrackGeojson: input.plannedTrackGeojson }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        createdBy: ctx.userId,
      };
      if (input.overrideConflicts) {
        const created = await prisma.patrolSchedule.create({ data: createData });
        // Extended prisma client is structurally compatible but not assignable to PrismaClient — safe cast.
        await writeAuditLog(prisma as unknown as PrismaClient, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "PATROL_SCHEDULE:OVERRIDE_CONFLICT",
          entityType: "PatrolSchedule",
          entityId: created.id,
          changesJson: {
            rangerUserId: input.rangerUserId ?? null,
            scheduledStart: input.scheduledStart.toISOString(),
            scheduledEnd: effectiveEnd.toISOString(),
          },
        });
        return created;
      }
      return prisma.patrolSchedule.create({ data: createData });
    }),

  update: matrixProcedure(coordinatorProcedure, "patrol-schedule", "update")
    .input(
      z.object({
        id: z.string(),
        patrolAreaId: z.string().optional(),
        rangerUserId: z.string().optional(),
        rangerName: z.string().min(1).max(200).optional(),
        accompanyingRangers: z.array(accompanyingRangerSchema).optional(),
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
        plannedHours: z.number().positive().max(1000).optional(),
        plannedTrackGeojson: z.record(z.any()).optional(),
        status: z.nativeEnum(PatrolScheduleStatus).optional(),
        notes: z.string().max(2000).optional(),
        overrideConflicts: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, overrideConflicts, scheduledEnd: inputScheduledEnd, plannedHours: inputPlannedHours, scheduledStart: inputScheduledStart, ...rest } = input;
      const data: Record<string, unknown> = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      const schedule = await prisma.patrolSchedule.findFirst({
        where: { id, tenantId: ctx.tenantId },
      });
      if (!schedule) {
        throw new Error("Not found");
      }
      // Resolve effective values for conflict check
      const effectiveRangerId =
        input.rangerUserId !== undefined ? input.rangerUserId : schedule.rangerUserId;
      const effectiveStart = inputScheduledStart ?? schedule.scheduledStart;
      const effectivePlannedHours =
        inputPlannedHours !== undefined ? inputPlannedHours : schedule.plannedHours ?? undefined;
      // Recompute scheduledEnd from plannedHours whenever plannedHours OR
      // scheduledStart changed (and an effective plannedHours is known);
      // otherwise fall back to an explicit scheduledEnd, else keep as-is.
      let effectiveEnd: Date;
      if (
        (inputPlannedHours !== undefined || inputScheduledStart !== undefined) &&
        effectivePlannedHours !== undefined
      ) {
        effectiveEnd = new Date(effectiveStart.getTime() + effectivePlannedHours * 3600 * 1000);
      } else if (inputScheduledEnd !== undefined) {
        effectiveEnd = inputScheduledEnd;
      } else {
        effectiveEnd = schedule.scheduledEnd;
      }
      if (inputScheduledStart !== undefined) {
        data.scheduledStart = inputScheduledStart;
      }
      if (inputPlannedHours !== undefined) {
        data.plannedHours = inputPlannedHours;
      }
      if (
        inputScheduledEnd !== undefined ||
        inputPlannedHours !== undefined ||
        inputScheduledStart !== undefined
      ) {
        data.scheduledEnd = effectiveEnd;
      }
      if (effectiveRangerId !== null && !overrideConflicts) {
        const conflicts = await findOverlappingSchedules(
          ctx.tenantId,
          effectiveRangerId,
          effectiveStart,
          effectiveEnd,
          id,
        );
        if (conflicts.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ranger has overlapping assignments",
            cause: { conflictingSchedules: conflicts },
          });
        }
      }
      if (overrideConflicts) {
        const updated = await prisma.patrolSchedule.update({ where: { id }, data });
        const changesJson: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          if (v instanceof Date) {
            changesJson[k] = v.toISOString();
          } else if (typeof v === "string") {
            changesJson[k] = v;
          }
        }
        // Extended prisma client is structurally compatible but not assignable to PrismaClient — safe cast.
        await writeAuditLog(prisma as unknown as PrismaClient, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: "PATROL_SCHEDULE:OVERRIDE_CONFLICT",
          entityType: "PatrolSchedule",
          entityId: id,
          changesJson,
        });
        return updated;
      }
      return prisma.patrolSchedule.update({ where: { id }, data });
    }),

  delete: matrixProcedure(coordinatorProcedure, "patrol-schedule", "delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await prisma.patrolSchedule.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
      if (!schedule) {
        throw new Error("Not found");
      }
      return prisma.patrolSchedule.delete({ where: { id: input.id } });
    }),

  // Lightweight status-only update (Kanban drag). Reuses the "update" matrix
  // gate — no conflict re-check since neither the ranger nor the time
  // window changes.
  setStatus: matrixProcedure(coordinatorProcedure, "patrol-schedule", "update")
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(PatrolScheduleStatus),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedule = await prisma.patrolSchedule.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
      if (!schedule) {
        throw new Error("Not found");
      }
      return prisma.patrolSchedule.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
});
