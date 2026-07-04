import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

// WAR ROOM date-range input (2026-06-25, goal items 3-4). Optional and
// backward-compatible: when omitted, every procedure behaves exactly as it did
// pre-2026-06-25 (other callers + existing tests are unaffected). The War Room
// frontend always supplies a range (default [now - 7 days, now]); the picker
// lets the operator choose any FROM/TO. Other callers may omit it.
const rangeInput = z
  .object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  })
  .optional();

type RangeInput = z.infer<typeof rangeInput>;

// Build a Prisma DateTime range filter from the range input, or undefined when
// no range was supplied. Callers conditionally spread `{ field: range }` so the
// absence of a range is a true no-op (preserves default behavior).
function buildRange(input: RangeInput): { gte?: Date; lte?: Date } | undefined {
  if (input == null) return undefined;
  const { dateFrom, dateTo } = input;
  if (dateFrom == null && dateTo == null) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (dateFrom != null) range.gte = dateFrom;
  if (dateTo != null) range.lte = dateTo;
  return range;
}

export const dashboardRouter = router({
  kpis: tenantProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // activeEvents honors the selected range AND is scoped to events tied to an
    // OPEN patrol — so the KPI count matches its drilldown list (which filters
    // event.list with state=active + linkedToActivePatrol). activePatrols /
    // rangersOnDuty are live-status metrics (currently open patrols) and
    // eventsThisMonth/eventsLastMonth are an explicit month-over-month
    // comparison — both intentionally range-independent.
    const eventRange = buildRange(input);

    const [
      activeEvents,
      activePatrols,
      rangersOnDuty,
      eventsThisMonth,
      eventsLastMonth,
    ] = await Promise.all([
      prisma.event.count({
        where: {
          tenantId: ctx.tenantId,
          state: "active",
          patrol: { is: { state: "open", isDeleted: false } },
          ...(eventRange ? { reportedAt: eventRange } : {}),
        },
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

  // WAR ROOM "Recent Patrols" table. In the EarthRanger dataset the patrol
  // leader + track data lives on COMPLETED patrols (open patrols are
  // header-only shells with no segment/leader), so an open-only list shows
  // blank rangers. Return the most recent patrols regardless of state, ordered
  // by start time (nulls last) so leadered, real patrols surface first
  // (owner-chosen behaviour 2026-06-24). leaderName is the first segment that
  // actually has a leader; null → the card renders an honest "—".
  // 2026-06-25: optional date range filters by startTime when supplied.
  activePatrols: tenantProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      const startRange = buildRange(input);
      const patrols = await prisma.patrol.findMany({
        where: {
          tenantId: ctx.tenantId,
          isDeleted: false,
          isTestPatrol: false,
          ...(startRange ? { startTime: startRange } : {}),
        },
        orderBy: { startTime: { sort: "desc", nulls: "last" } },
        take: 15,
        select: {
          id: true,
          patrolType: true,
          areaName: true,
          startTime: true,
          totalDistanceKm: true,
          computedDistanceKm: true,
          segments: { select: { leaderName: true } },
        },
      });

      return patrols.map((p) => ({
        id: p.id,
        patrolType: p.patrolType,
        areaName: p.areaName,
        startTime: p.startTime,
        totalDistanceKm: p.totalDistanceKm,
        computedDistanceKm: p.computedDistanceKm,
        leaderName:
          p.segments.find(
            (s) => s.leaderName != null && s.leaderName.length > 0,
          )?.leaderName ?? null,
      }));
    }),

  eventBreakdown: tenantProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      // Exclude Skylight automated vessel-detection events from the WAR ROOM
      // breakdown bars. Skylight events arrive from EarthRanger with
      // eventType.category = "analyzer_event"; the only reliable Skylight marker
      // is the eventType.display ("Skylight Entry Alert", "Skylight Detection
      // Alert", etc.), so match case-insensitively on display (owner decision
      // 2026-06-23 hardened). 2026-06-25: optional date range filters reportedAt.
      const reportedRange = buildRange(input);
      const events = await prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
          ...(reportedRange ? { reportedAt: reportedRange } : {}),
        },
        select: { eventType: { select: { category: true, display: true } } },
      });

      const lawEnforcement: Record<string, number> = {};
      const monitoring: Record<string, number> = {};

      for (const e of events) {
        const category = e.eventType?.category ?? "uncategorized";
        const display = e.eventType?.display ?? "Unknown";

        // Bucket strictly by the REAL EarthRanger category values. Every other
        // category (hidden / emergency / maintenance / analyzer_event /
        // observation / security / violation / null) is excluded from BOTH
        // breakdown bars (owner decision 2026-06-25).
        if (category === "law-enforcement-and-apprehensions") {
          lawEnforcement[display] = (lawEnforcement[display] ?? 0) + 1;
        } else if (category === "monitoring_patrolling_and_surveillance") {
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

  recentEvents: tenantProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      // Skylight is a maritime satellite AIS/radar monitoring provider whose
      // events are ingested via EarthRanger under eventType.category =
      // "analyzer_event"; they are identified by eventType.display beginning with
      // "Skylight ...". These are automated vessel-detection records, not
      // human-reported incidents, and should not appear in the WAR ROOM Live Event
      // Feed (owner decision 2026-06-23). 2026-06-25: optional date range filters
      // reportedAt (the feed shows the most recent in-range events).
      const reportedRange = buildRange(input);
      return prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
          ...(reportedRange ? { reportedAt: reportedRange } : {}),
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

  // WAR ROOM 5th KPI — true unacknowledged alert count. Defaults to the last 24h
  // window; when a date range is supplied (War Room range header) it counts
  // unacknowledged alerts fired within that range instead.
  // Owner decision accepted 2026-06-21 (closes WHAT_OWNER_DECISIONS ACK item).
  alertStats: tenantProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      const firedRange = buildRange(input) ?? {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      };
      const unacknowledged = await prisma.alertHistory.count({
        where: {
          tenantId: ctx.tenantId,
          firedAt: firedRange,
          acknowledgedAt: null,
        },
      });
      return { unacknowledged };
    }),

  // WAR ROOM "Last Incident" card — the most recent high-priority
  // (matchedPriority >= 200, i.e. High/Critical) event, derived from existing
  // Event rows. Returns null when no high-priority event exists.
  // 2026-06-25: optional date range filters reportedAt (most recent in range).
  lastIncident: tenantProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      const reportedRange = buildRange(input);
      return prisma.event.findFirst({
        where: {
          tenantId: ctx.tenantId,
          priority: { gte: 200 },
          NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
          ...(reportedRange ? { reportedAt: reportedRange } : {}),
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

  // WAR ROOM KPI sparklines — daily-bucketed counts of events (reportedAt) and
  // patrols (startTime) across the active range, zero-filled per day so each
  // sparkline renders a continuous series. Defaults to the last 7 days when no
  // range is supplied (matches the War Room default window). Read-only.
  kpiTrends: tenantProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    const supplied = buildRange(input);
    const to = supplied?.lte ?? new Date();
    const from =
      supplied?.gte ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Inclusive list of UTC day keys (YYYY-MM-DD) from `from` to `to`.
    const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
    const days: string[] = [];
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    const end = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
    );
    while (cursor <= end) {
      days.push(dayKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const [events, patrols] = await Promise.all([
      prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          reportedAt: { gte: from, lte: to },
          NOT: {
            eventType: {
              display: { contains: "skylight", mode: "insensitive" },
            },
          },
        },
        select: { reportedAt: true },
      }),
      prisma.patrol.findMany({
        where: {
          tenantId: ctx.tenantId,
          isDeleted: false,
          isTestPatrol: false,
          startTime: { gte: from, lte: to },
        },
        select: { startTime: true },
      }),
    ]);

    const bucket = (
      rows: { date: Date | null }[],
    ): { date: string; count: number }[] => {
      const counts: Record<string, number> = {};
      for (const day of days) counts[day] = 0;
      for (const r of rows) {
        if (r.date == null) continue;
        const key = dayKey(r.date);
        if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
      }
      return days.map((date) => ({ date, count: counts[date] ?? 0 }));
    };

    return {
      events: bucket(events.map((e) => ({ date: e.reportedAt }))),
      patrols: bucket(patrols.map((p) => ({ date: p.startTime }))),
    };
  }),

  // WAR ROOM ranger roster — per-ranger live status derived from KnownRanger +
  // their patrol involvement (AccompanyingRanger → Patrol). A ranger is
  // `on_patrol` when linked to a currently-open patrol, `active` when they have
  // a patrol within the active range, otherwise `idle`. lastSeenAt is the most
  // recent in-range patrol startTime they were on. patrolHoursInRange is the
  // sum, in hours, of the ranger's in-range patrol durations (startTime→endTime;
  // for a still-open patrol, startTime→now). Default sort (owner spec,
  // 2026-07-04): status group priority on_patrol > active > idle, then within
  // each group by patrolHoursInRange descending. Read-only aggregation.
  rangerRoster: tenantProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      const startRange = buildRange(input);
      const now = new Date();

      const [knownRangers, openPatrols, rangePatrols, accompanying] =
        await Promise.all([
          prisma.knownRanger.findMany({
            where: { tenantId: ctx.tenantId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          prisma.patrol.findMany({
            where: {
              tenantId: ctx.tenantId,
              isDeleted: false,
              state: "open",
            },
            select: { id: true },
          }),
          prisma.patrol.findMany({
            where: {
              tenantId: ctx.tenantId,
              isDeleted: false,
              isTestPatrol: false,
              ...(startRange ? { startTime: startRange } : {}),
            },
            select: { id: true, startTime: true, endTime: true },
          }),
          prisma.accompanyingRanger.findMany({
            where: {
              tenantId: ctx.tenantId,
              entityType: "patrol",
              knownRangerId: { not: null },
            },
            select: { knownRangerId: true, entityId: true },
          }),
        ]);

      const openIds = new Set(openPatrols.map((p) => p.id));
      const rangePatrolById = new Map(
        rangePatrols.map((p) => [p.id, { startTime: p.startTime, endTime: p.endTime }]),
      );

      // ranger id → patrol ids they are linked to (via AccompanyingRanger).
      const patrolsByRanger = new Map<string, string[]>();
      for (const a of accompanying) {
        if (a.knownRangerId == null) continue;
        const list = patrolsByRanger.get(a.knownRangerId) ?? [];
        list.push(a.entityId);
        patrolsByRanger.set(a.knownRangerId, list);
      }

      const STATUS_RANK: Record<"on_patrol" | "active" | "idle", number> = {
        on_patrol: 0,
        active: 1,
        idle: 2,
      };

      const rangers = knownRangers.map((r) => {
        const patrolIds = patrolsByRanger.get(r.id) ?? [];
        const onPatrol = patrolIds.some((id) => openIds.has(id));
        let patrolsInRange = 0;
        let patrolHoursInRange = 0;
        let lastSeenAt: Date | null = null;
        for (const id of patrolIds) {
          const patrol = rangePatrolById.get(id);
          if (patrol == null) continue;
          patrolsInRange += 1;
          const { startTime, endTime } = patrol;
          if (startTime != null && (lastSeenAt == null || startTime > lastSeenAt)) {
            lastSeenAt = startTime;
          }
          // Duration in hours: completed patrols use startTime→endTime; a
          // still-open patrol (no endTime yet) counts startTime→now so its
          // accruing hours still weigh into the sort.
          if (startTime != null) {
            const end = endTime ?? now;
            const hours = (end.getTime() - startTime.getTime()) / (1000 * 60 * 60);
            if (hours > 0) patrolHoursInRange += hours;
          }
        }
        const status: "on_patrol" | "active" | "idle" = onPatrol
          ? "on_patrol"
          : patrolsInRange > 0
            ? "active"
            : "idle";
        return {
          id: r.id,
          name: r.name,
          status,
          lastSeenAt,
          patrolsInRange,
          patrolHoursInRange,
        };
      });

      // Primary: status group (on_patrol > active > idle). Secondary: patrol
      // hours in range, descending — most-hours ranger sits at the top of its
      // group. Client applies the same comparator as a safety net.
      rangers.sort((a, b) => {
        const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (rankDiff !== 0) return rankDiff;
        return b.patrolHoursInRange - a.patrolHoursInRange;
      });

      return {
        rangers,
        summary: {
          total: rangers.length,
          onPatrol: rangers.filter((r) => r.status === "on_patrol").length,
          active: rangers.filter((r) => r.status === "active").length,
          idle: rangers.filter((r) => r.status === "idle").length,
        },
      };
    }),
});
