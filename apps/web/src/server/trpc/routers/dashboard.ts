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
    // activeEvents honors the selected range (events needing attention in the
    // window). activePatrols / rangersOnDuty are live-status metrics (currently
    // open patrols) and eventsThisMonth/eventsLastMonth are an explicit
    // month-over-month comparison — both intentionally range-independent.
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
          state: { not: "resolved" },
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
});
