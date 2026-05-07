import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

export const dashboardRouter = router({
  kpis: tenantProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      activeEvents,
      activePatrols,
      rangersOnDuty,
      eventsThisMonth,
      eventsLastMonth,
    ] = await Promise.all([
      prisma.event.count({
        where: { tenantId: ctx.tenantId, state: { not: "resolved" } },
      }),
      prisma.patrol.count({
        where: { tenantId: ctx.tenantId, state: "open" },
      }),
      prisma.accompanyingRanger.findMany({
        where: {
          tenantId: ctx.tenantId,
          entityType: "patrol",
          entityId: {
            in: (
              await prisma.patrol.findMany({
                where: { tenantId: ctx.tenantId, state: "open" },
                select: { id: true },
              })
            ).map((p) => p.id),
          },
        },
        select: { registeredUserId: true, knownRangerId: true },
      }),
      prisma.event.count({
        where: {
          tenantId: ctx.tenantId,
          reportedAt: { gte: startOfMonth },
        },
      }),
      prisma.event.count({
        where: {
          tenantId: ctx.tenantId,
          reportedAt: { gte: startOfLastMonth, lt: startOfMonth },
        },
      }),
    ]);

    const uniqueRangerIds = new Set<string>();
    for (const r of rangersOnDuty) {
      if (r.registeredUserId !== null) uniqueRangerIds.add(`u:${r.registeredUserId}`);
      if (r.knownRangerId !== null) uniqueRangerIds.add(`k:${r.knownRangerId}`);
    }

    return {
      activeEvents,
      activePatrols,
      rangersOnDuty: uniqueRangerIds.size,
      eventsThisMonth,
      eventsLastMonth,
    };
  }),

  eventBreakdown: tenantProcedure.query(async ({ ctx }) => {
    const events = await prisma.event.findMany({
      where: { tenantId: ctx.tenantId },
      select: { eventType: { select: { category: true, display: true } } },
    });

    const lawEnforcement: Record<string, number> = {};
    const monitoring: Record<string, number> = {};

    for (const e of events) {
      const category = e.eventType?.category ?? "uncategorized";
      const display = e.eventType?.display ?? "Unknown";

      if (category === "law_enforcement") {
        lawEnforcement[display] = (lawEnforcement[display] ?? 0) + 1;
      } else {
        monitoring[display] = (monitoring[display] ?? 0) + 1;
      }
    }

    return {
      lawEnforcement: Object.entries(lawEnforcement).map(([type, count]) => ({
        type,
        count,
      })),
      monitoring: Object.entries(monitoring).map(([type, count]) => ({
        type,
        count,
      })),
    };
  }),

  recentEvents: tenantProcedure.query(async ({ ctx }) => {
    return prisma.event.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { reportedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        priority: true,
        state: true,
        reportedAt: true,
        eventType: { select: { display: true, category: true } },
      },
    });
  }),
});
