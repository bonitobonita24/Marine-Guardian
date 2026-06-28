/**
 * reportMap tRPC router — aggregations for the Interactive Report Map
 * (2026-06-27).
 *
 * The report surface (presented to the Mayor / investors) renders a chart band
 * below the map whose every panel follows the same {from, to, municipalityId}
 * filter as the markers. Rather than thread a municipality dimension through the
 * shared dashboard `rangeInput` (which would ripple into every Command Center
 * query), all report aggregations live here in one cohesive, CC-decoupled
 * router:
 *   summary        — KPI tiles (event/patrol/law-enforcement/monitoring counts)
 *   eventBreakdown — top event types split by category (BreakdownBars data)
 *   eventsOverTime — daily event counts (continuous series for the line chart)
 *
 * All three are tenant-scoped (ctx.tenantId) and exclude Skylight automated
 * vessel-detection events (display-based filter) so the numbers match the map's
 * event markers exactly. Real EarthRanger category buckets are reused verbatim
 * from dashboard.eventBreakdown for visual consistency across surfaces.
 */

import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";
import { SERIOUS_EVENT_PATTERNS } from "@/components/map/eventMarkerStyle";

const LAW_CATEGORY = "law-enforcement-and-apprehensions";
const MONITORING_CATEGORY = "monitoring_patrolling_and_surveillance";

const reportFilterInput = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    municipalityId: z.string().optional(),
  })
  .strict();

type ReportFilterInput = z.infer<typeof reportFilterInput>;

/**
 * Event where-clause shared by every report aggregation: tenant-scoped, Skylight
 * excluded (markers exclude it too), optional reportedAt range + municipality.
 */
function eventWhere(tenantId: string, input: ReportFilterInput) {
  const where: {
    tenantId: string;
    NOT: { eventType: { display: { contains: string; mode: "insensitive" } } };
    reportedAt?: { gte?: Date; lte?: Date };
    municipalityId?: string;
  } = {
    tenantId,
    NOT: {
      eventType: { display: { contains: "skylight", mode: "insensitive" } },
    },
  };
  const reportedAt: { gte?: Date; lte?: Date } = {};
  if (input.from) reportedAt.gte = input.from;
  if (input.to) reportedAt.lte = input.to;
  if (reportedAt.gte !== undefined || reportedAt.lte !== undefined) {
    where.reportedAt = reportedAt;
  }
  if (input.municipalityId !== undefined) {
    where.municipalityId = input.municipalityId;
  }
  return where;
}

/** Patrol where-clause: non-deleted, non-test, optional startTime + municipality. */
function patrolWhere(tenantId: string, input: ReportFilterInput) {
  const where: {
    tenantId: string;
    isDeleted: false;
    isTestPatrol: false;
    startTime?: { gte?: Date; lte?: Date };
    municipalityId?: string;
  } = { tenantId, isDeleted: false, isTestPatrol: false };
  const startTime: { gte?: Date; lte?: Date } = {};
  if (input.from) startTime.gte = input.from;
  if (input.to) startTime.lte = input.to;
  if (startTime.gte !== undefined || startTime.lte !== undefined) {
    where.startTime = startTime;
  }
  if (input.municipalityId !== undefined) {
    where.municipalityId = input.municipalityId;
  }
  return where;
}

/** Local-calendar `yyyy-MM-dd` key for daily bucketing. */
function dayKey(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const reportMapRouter = router({
  summary: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const baseEvent = eventWhere(ctx.tenantId, input);
      const [totalEvents, lawEnforcementEvents, monitoringEvents, totalPatrols] =
        await Promise.all([
          prisma.event.count({ where: baseEvent }),
          prisma.event.count({
            where: { ...baseEvent, eventType: { category: LAW_CATEGORY } },
          }),
          prisma.event.count({
            where: { ...baseEvent, eventType: { category: MONITORING_CATEGORY } },
          }),
          prisma.patrol.count({ where: patrolWhere(ctx.tenantId, input) }),
        ]);

      return {
        totalEvents,
        totalPatrols,
        lawEnforcementEvents,
        monitoringEvents,
      };
    }),

  eventBreakdown: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const events = await prisma.event.findMany({
        where: eventWhere(ctx.tenantId, input),
        select: { eventType: { select: { category: true, display: true } } },
      });

      const lawEnforcement: Record<string, number> = {};
      const monitoring: Record<string, number> = {};

      for (const e of events) {
        const category = e.eventType?.category ?? "uncategorized";
        const display = e.eventType?.display ?? "Unknown";
        if (category === LAW_CATEGORY) {
          lawEnforcement[display] = (lawEnforcement[display] ?? 0) + 1;
        } else if (category === MONITORING_CATEGORY) {
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

  /**
   * High-priority ("serious incident") events in the filtered range/municipality,
   * for the Report Map's High Priority Events list. "Serious" = the same event
   * types flagged with the attention-drawing red marker on the map
   * (SERIOUS_EVENT_PATTERNS — Compressor Fishing, Taking of Prohibited Species,
   * Use of Prohibited Gears, Threats on Habitat, Marine Wildlife Sightings).
   * Ordered most-severe (priority) then most-recent; capped at 50. `total` is the
   * unbounded count so the card can show "N" even when the list is truncated.
   */
  highPriorityEvents: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const where = {
        ...eventWhere(ctx.tenantId, input),
        OR: SERIOUS_EVENT_PATTERNS.map((p) => ({
          eventType: {
            display: { contains: p, mode: "insensitive" as const },
          },
        })),
      };

      const [rows, total] = await Promise.all([
        prisma.event.findMany({
          where,
          select: {
            id: true,
            title: true,
            priority: true,
            reportedAt: true,
            eventType: { select: { display: true, category: true } },
            municipality: { select: { name: true } },
            locationLat: true,
            locationLon: true,
          },
          orderBy: [{ priority: "desc" }, { reportedAt: "desc" }],
          take: 50,
        }),
        prisma.event.count({ where }),
      ]);

      return {
        total,
        events: rows.map((e) => ({
          id: e.id,
          title: e.title,
          priority: e.priority,
          reportedAt: e.reportedAt,
          typeDisplay: e.eventType?.display ?? null,
          category: e.eventType?.category ?? null,
          municipalityName: e.municipality?.name ?? null,
          locationLat: e.locationLat ?? null,
          locationLon: e.locationLon ?? null,
        })),
      };
    }),

  eventsOverTime: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const events = await prisma.event.findMany({
        where: eventWhere(ctx.tenantId, input),
        select: { reportedAt: true },
      });

      const counts: Record<string, number> = {};
      for (const e of events) {
        if (e.reportedAt === null) continue;
        const key = dayKey(e.reportedAt);
        counts[key] = (counts[key] ?? 0) + 1;
      }

      // When both bounds are present, emit a continuous daily series (filling
      // zero days) so the line chart has no gaps. Otherwise return only the days
      // that have events, ascending.
      if (input.from && input.to) {
        const series: { date: string; count: number }[] = [];
        const cursor = new Date(
          input.from.getFullYear(),
          input.from.getMonth(),
          input.from.getDate(),
        );
        const end = new Date(
          input.to.getFullYear(),
          input.to.getMonth(),
          input.to.getDate(),
        );
        // Bound the fill to a sane horizon to avoid runaway loops on a huge range.
        let guard = 0;
        while (cursor.getTime() <= end.getTime() && guard < 400) {
          const key = dayKey(cursor);
          series.push({ date: key, count: counts[key] ?? 0 });
          cursor.setDate(cursor.getDate() + 1);
          guard += 1;
        }
        return series;
      }

      return Object.entries(counts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }),
});
