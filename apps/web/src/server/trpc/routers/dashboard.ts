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
        where: { tenantId: ctx.tenantId, state: "open", isDeleted: false },
      }),
      prisma.accompanyingRanger.findMany({
        where: {
          tenantId: ctx.tenantId,
          entityType: "patrol",
          entityId: {
            in: (
              await prisma.patrol.findMany({
                where: { tenantId: ctx.tenantId, state: "open", isDeleted: false },
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
    // Exclude Skylight automated vessel-detection events from the WAR ROOM
    // breakdown bars (same filter as recentEvents — owner decision 2026-06-23).
    const events = await prisma.event.findMany({
      where: {
        tenantId: ctx.tenantId,
        NOT: { eventType: { category: "skylight" } },
      },
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
    // Skylight is a maritime satellite AIS/radar monitoring provider whose
    // events are ingested via EarthRanger with eventType.category = "skylight".
    // These are automated vessel-detection records, not human-reported incidents,
    // and should not appear in the WAR ROOM Live Event Feed (owner decision 2026-06-23).
    return prisma.event.findMany({
      where: {
        tenantId: ctx.tenantId,
        NOT: { eventType: { category: "skylight" } },
      },
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

  // WAR ROOM 5th KPI — true unacknowledged alert count (last 24h window).
  // Now that AlertHistory carries acknowledgedAt, we can derive the real value.
  // Owner decision accepted 2026-06-21 (closes WHAT_OWNER_DECISIONS ACK item).
  alertStats: tenantProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unacknowledged = await prisma.alertHistory.count({
      where: {
        tenantId: ctx.tenantId,
        firedAt: { gte: since },
        acknowledgedAt: null,
      },
    });
    return { unacknowledged };
  }),

  // WAR ROOM "Last Incident" card — the most recent high-priority
  // (matchedPriority >= 200, i.e. High/Critical) event, derived from existing
  // Event rows. Returns null when no high-priority event exists.
  lastIncident: tenantProcedure.query(async ({ ctx }) => {
    return prisma.event.findFirst({
      where: {
        tenantId: ctx.tenantId,
        priority: { gte: 200 },
        NOT: { eventType: { category: "skylight" } },
      },
      orderBy: { reportedAt: "desc" },
      select: {
        id: true,
        title: true,
        priority: true,
        reportedAt: true,
        eventType: { select: { display: true, category: true } },
      },
    });
  }),
});
