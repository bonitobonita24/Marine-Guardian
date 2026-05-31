import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { coordinatorProcedure } from "../middleware/rbac";
import { prisma, platformPrisma, writeAuditLog } from "@marine-guardian/db";

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
  list: tenantProcedure
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

  checkConflicts: tenantProcedure
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

  create: coordinatorProcedure
    .input(
      z.object({
        patrolAreaId: z.string(),
        rangerUserId: z.string().optional(),
        rangerName: z.string().min(1).max(200),
        scheduledStart: z.date(),
        scheduledEnd: z.date(),
        notes: z.string().max(2000).optional(),
        overrideConflicts: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.rangerUserId !== undefined && !input.overrideConflicts) {
        const conflicts = await findOverlappingSchedules(
          ctx.tenantId,
          input.rangerUserId,
          input.scheduledStart,
          input.scheduledEnd,
        );
        if (conflicts.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ranger has overlapping assignments",
            cause: { conflictingSchedules: conflicts },
          });
        }
      }
      if (input.overrideConflicts) {
        return platformPrisma.$transaction(async (tx) => {
          const created = await tx.patrolSchedule.create({
            data: {
              tenantId: ctx.tenantId,
              patrolAreaId: input.patrolAreaId,
              ...(input.rangerUserId !== undefined ? { rangerUserId: input.rangerUserId } : {}),
              rangerName: input.rangerName,
              scheduledStart: input.scheduledStart,
              scheduledEnd: input.scheduledEnd,
              ...(input.notes !== undefined ? { notes: input.notes } : {}),
              createdBy: ctx.userId,
            },
          });
          await writeAuditLog(tx, {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            action: "PATROL_SCHEDULE:OVERRIDE_CONFLICT",
            entityType: "PatrolSchedule",
            entityId: created.id,
            changesJson: {
              rangerUserId: input.rangerUserId ?? null,
              scheduledStart: input.scheduledStart.toISOString(),
              scheduledEnd: input.scheduledEnd.toISOString(),
            },
          });
          return created;
        });
      }
      return prisma.patrolSchedule.create({
        data: {
          tenantId: ctx.tenantId,
          patrolAreaId: input.patrolAreaId,
          ...(input.rangerUserId !== undefined ? { rangerUserId: input.rangerUserId } : {}),
          rangerName: input.rangerName,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          createdBy: ctx.userId,
        },
      });
    }),

  update: coordinatorProcedure
    .input(
      z.object({
        id: z.string(),
        rangerUserId: z.string().optional(),
        rangerName: z.string().min(1).max(200).optional(),
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
        notes: z.string().max(2000).optional(),
        overrideConflicts: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, overrideConflicts, ...rest } = input;
      const data = Object.fromEntries(
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
      const effectiveStart = input.scheduledStart ?? schedule.scheduledStart;
      const effectiveEnd = input.scheduledEnd ?? schedule.scheduledEnd;
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
        return platformPrisma.$transaction(async (tx) => {
          const updated = await tx.patrolSchedule.update({ where: { id }, data });
          const changesJson: Record<string, string> = {};
          for (const [k, v] of Object.entries(data)) {
            if (v instanceof Date) {
              changesJson[k] = v.toISOString();
            } else if (typeof v === "string") {
              changesJson[k] = v;
            }
          }
          await writeAuditLog(tx, {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            action: "PATROL_SCHEDULE:OVERRIDE_CONFLICT",
            entityType: "PatrolSchedule",
            entityId: id,
            changesJson,
          });
          return updated;
        });
      }
      return prisma.patrolSchedule.update({ where: { id }, data });
    }),

  delete: coordinatorProcedure
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
});
