import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { matrixProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

type ActivityType =
  | "event-reported"
  | "event-accompanied"
  | "patrol-led"
  | "patrol-accompanied";

interface ActivityItem {
  type: ActivityType;
  entityId: string;
  title: string | null;
  timestamp: Date;
}

export const rangerRouter = router({
  getById: matrixProcedure(tenantProcedure, "events", "view")
    .input(z.object({ id: z.string() }).strict())
    .query(async ({ input, ctx }) => {
      const ranger = await prisma.knownRanger.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
      });

      if (!ranger) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ranger not found.",
        });
      }

      const accompanyingRecords = await prisma.accompanyingRanger.findMany({
        where: { knownRangerId: ranger.id, tenantId: ctx.tenantId },
      });

      const accompaniedEventIds = accompanyingRecords
        .filter((r) => r.entityType === "event")
        .map((r) => r.entityId);

      const accompaniedPatrolIds = accompanyingRecords
        .filter((r) => r.entityType === "patrol")
        .map((r) => r.entityId);

      const ledPatrolSegments =
        ranger.erSubjectId !== null && ranger.erSubjectId !== ""
          ? await prisma.patrolSegment.findMany({
              where: { leaderErId: ranger.erSubjectId },
            })
          : [];
      const ledPatrolIds = ledPatrolSegments.map((s) => s.patrolId);
      const allPatrolIds = [
        ...new Set([...ledPatrolIds, ...accompaniedPatrolIds]),
      ];

      const reportedEvents = await prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          reportedByName: { equals: ranger.name, mode: "insensitive" },
        },
        select: {
          id: true,
          eventTypeId: true,
          title: true,
          reportedAt: true,
        },
      });

      const accompaniedEvents =
        accompaniedEventIds.length > 0
          ? await prisma.event.findMany({
              where: { id: { in: accompaniedEventIds } },
              select: {
                id: true,
                eventTypeId: true,
                title: true,
                reportedAt: true,
              },
            })
          : [];

      const eventTypeIds = [
        ...new Set(
          [...reportedEvents, ...accompaniedEvents]
            .map((e) => e.eventTypeId)
            .filter((id): id is string => id !== null),
        ),
      ];

      const eventTypes =
        eventTypeIds.length > 0
          ? await prisma.eventType.findMany({
              where: { id: { in: eventTypeIds } },
              select: { id: true, category: true },
            })
          : [];

      const categoryByEventTypeId = new Map<string, string | null>(
        eventTypes.map((et) => [et.id, et.category]),
      );

      const categoryOf = (eventTypeId: string | null): string => {
        if (eventTypeId === null) return "Uncategorized";
        return categoryByEventTypeId.get(eventTypeId) ?? "Uncategorized";
      };

      const breakdownMap = new Map<
        string,
        { reported: number; accompanied: number }
      >();
      const ensureBucket = (category: string) => {
        const existing = breakdownMap.get(category);
        if (existing) return existing;
        const fresh = { reported: 0, accompanied: 0 };
        breakdownMap.set(category, fresh);
        return fresh;
      };

      for (const ev of reportedEvents) {
        ensureBucket(categoryOf(ev.eventTypeId)).reported += 1;
      }
      for (const ev of accompaniedEvents) {
        ensureBucket(categoryOf(ev.eventTypeId)).accompanied += 1;
      }

      const categoryBreakdown = [...breakdownMap.entries()].map(
        ([category, counts]) => ({
          category,
          reported: counts.reported,
          accompanied: counts.accompanied,
          total: counts.reported + counts.accompanied,
        }),
      );

      const reportedCount = reportedEvents.length;
      const accompaniedCount = accompaniedEvents.length;

      const patrols =
        allPatrolIds.length > 0
          ? await prisma.patrol.findMany({
              where: { id: { in: allPatrolIds } },
              select: {
                id: true,
                title: true,
                patrolType: true,
                startTime: true,
                totalDistanceKm: true,
                totalHours: true,
              },
            })
          : [];

      const patrolStats = {
        foot: { count: 0, km: 0, hours: 0 },
        sea: { count: 0, km: 0, hours: 0 },
      };
      for (const p of patrols) {
        const bucket =
          p.patrolType === "foot" ? patrolStats.foot : patrolStats.sea;
        bucket.count += 1;
        bucket.km += p.totalDistanceKm ?? 0;
        bucket.hours += p.totalHours ?? 0;
      }

      const activityItems: ActivityItem[] = [];

      for (const ev of reportedEvents) {
        activityItems.push({
          type: "event-reported",
          entityId: ev.id,
          title: ev.title,
          timestamp: ev.reportedAt ?? new Date(0),
        });
      }
      for (const ev of accompaniedEvents) {
        activityItems.push({
          type: "event-accompanied",
          entityId: ev.id,
          title: ev.title,
          timestamp: ev.reportedAt ?? new Date(0),
        });
      }

      const patrolById = new Map(patrols.map((p) => [p.id, p]));
      const ledPatrolIdSet = new Set(ledPatrolIds);
      for (const segment of ledPatrolSegments) {
        const patrol = patrolById.get(segment.patrolId);
        if (patrol) {
          activityItems.push({
            type: "patrol-led",
            entityId: patrol.id,
            title: patrol.title,
            timestamp:
              segment.actualStart ?? patrol.startTime ?? new Date(0),
          });
        }
      }
      for (const id of accompaniedPatrolIds) {
        if (ledPatrolIdSet.has(id)) continue;
        const patrol = patrolById.get(id);
        if (patrol) {
          activityItems.push({
            type: "patrol-accompanied",
            entityId: patrol.id,
            title: patrol.title,
            timestamp: patrol.startTime ?? new Date(0),
          });
        }
      }

      activityItems.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );
      const recentActivity = activityItems.slice(0, 50);

      return {
        profile: {
          id: ranger.id,
          name: ranger.name,
          source: ranger.source,
          erSubjectId: ranger.erSubjectId,
          isActive: ranger.isActive,
          createdAt: ranger.createdAt,
        },
        eventStats: {
          reportedCount,
          accompaniedCount,
          totalCredit: reportedCount + accompaniedCount,
          categoryBreakdown,
        },
        patrolStats,
        recentActivity,
      };
    }),
});
