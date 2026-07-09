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
import { isInlineSafeImageAsset } from "@marine-guardian/shared/lib/asset-mime";
import { SERIOUS_EVENT_PATTERNS } from "@/components/map/eventMarkerStyle";
import { pointsFromTrackGeojson } from "./map";
import { buildEventsPatrolsSeries, dayKeyToLabel } from "./time-series-bucketing";
import {
  resolveMunicipalityScope,
  municipalityScopeClause,
} from "../../reporting/municipality-scope";

const LAW_CATEGORY = "law-enforcement-and-apprehensions";
const MONITORING_CATEGORY = "monitoring_patrolling_and_surveillance";

const reportFilterInput = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    municipalityId: z.string().optional(),
    // Optional province rollup filter (2026-07-09): narrow every aggregation
    // to all municipalities within a given province. `municipalityId`, when
    // also provided, always wins (a specific municipality selection overrides
    // a province-wide rollup).
    province: z.string().optional(),
    // Optional MPA-scope filter (2026-06-29): narrow every aggregation to
    // events/patrols that fall inside a given protected zone.
    protectedZoneId: z.string().optional(),
    // Optional spatial terrain filter (2026-07-08): narrow every aggregation
    // to events/patrols classified as "land" or "water" (Event.terrain /
    // Patrol.terrain). Distinct from Patrol.patrolType (self-reported
    // foot/seaborne) — this is a geometry-derived classifier.
    terrain: z.enum(["land", "water"]).optional(),
  })
  .strict();

type ReportFilterInput = z.infer<typeof reportFilterInput>;

/**
 * Event where-clause shared by every report aggregation: tenant-scoped, Skylight
 * excluded (markers exclude it too), optional reportedAt range + municipality
 * scope (resolved from either a specific municipalityId or a province rollup
 * via `resolveMunicipalityScope`).
 */
function eventWhere(
  tenantId: string,
  input: ReportFilterInput,
  municipalityIds?: string[],
) {
  const where: {
    tenantId: string;
    NOT: { eventType: { display: { contains: string; mode: "insensitive" } } };
    reportedAt?: { gte?: Date; lte?: Date };
    municipalityId?: string | { in: string[] };
    coveredZones?: { some: { protectedZoneId: string } };
    terrain?: string;
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
  if (municipalityIds !== undefined) {
    where.municipalityId = municipalityScopeClause(municipalityIds);
  }
  if (input.protectedZoneId !== undefined) {
    where.coveredZones = { some: { protectedZoneId: input.protectedZoneId } };
  }
  if (input.terrain !== undefined) {
    where.terrain = input.terrain;
  }
  return where;
}

/**
 * Patrol where-clause: non-deleted, non-test, optional startTime + municipality
 * scope (resolved from either a specific municipalityId or a province rollup
 * via `resolveMunicipalityScope`).
 */
function patrolWhere(
  tenantId: string,
  input: ReportFilterInput,
  municipalityIds?: string[],
) {
  const where: {
    tenantId: string;
    isDeleted: false;
    isTestPatrol: false;
    startTime?: { gte?: Date; lte?: Date };
    municipalityId?: string | { in: string[] };
    coveredZones?: { some: { protectedZoneId: string } };
    terrain?: string;
  } = { tenantId, isDeleted: false, isTestPatrol: false };
  const startTime: { gte?: Date; lte?: Date } = {};
  if (input.from) startTime.gte = input.from;
  if (input.to) startTime.lte = input.to;
  if (startTime.gte !== undefined || startTime.lte !== undefined) {
    where.startTime = startTime;
  }
  if (municipalityIds !== undefined) {
    where.municipalityId = municipalityScopeClause(municipalityIds);
  }
  if (input.protectedZoneId !== undefined) {
    where.coveredZones = { some: { protectedZoneId: input.protectedZoneId } };
  }
  if (input.terrain !== undefined) {
    where.terrain = input.terrain;
  }
  return where;
}

type EventPoint = { id: string; title: string | null; lat: number; lon: number };

export type EventDetail = {
  id: string;
  title: string | null;
  typeDisplay: string;
  priority: number;
  reportedAt: Date | null;
  locationName: string | null;
  municipalityName: string | null;
  areaName: string | null;
  reportedByName: string | null;
  lat: number | null;
  lon: number | null;
  /** ER per-type dynamic field values (Event.eventDetailsJson, verbatim). */
  eventDetailsJson: unknown;
  hasPhoto: boolean;
  /**
   * EventAsset ids of archived IMAGE assets (telegramFileId present, image
   * mime), servable via the existing /api/assets/[id] proxy.
   */
  photoAssetIds: string[];
};

/**
 * Ids of the archived image assets among an event's EventAssets. Only assets
 * already archived to Telegram (telegramFileId non-null — enforced by the
 * caller's `where`) whose mime is INLINE-SAFE (same allowlist the
 * /api/assets/[id] proxy serves inline — an image/svg+xml or image/tiff
 * asset would come back as a forced download an <img> cannot render, i.e. a
 * guaranteed-broken thumbnail) qualify.
 */
export function photoAssetIdsFrom(
  // Optional so callers can pass a mocked/partial row straight through —
  // unit-test fixtures routinely omit the relation.
  assets:
    | Array<{ id: string; mimeType: string | null; filename: string }>
    | undefined,
): string[] {
  return (assets ?? [])
    .filter((a) => isInlineSafeImageAsset(a.mimeType, a.filename))
    .map((a) => a.id);
}

/**
 * Single-query implementation shared by `eventBreakdownWithCoords` (tRPC) and
 * the SSR print loader (S6). Returns breakdown rows WITH geo-points so the
 * printable report map can render category-coloured dot clusters without a
 * second round-trip.
 *
 * Contract: per-type `count` values MUST equal `eventBreakdown` for the same
 * filter; `highPriority.total` MUST equal `highPriorityEvents.total`.
 * Points include ONLY events where both lat AND lon are non-null.
 *
 * `includeEventDetails` (S2, print loader ONLY): additionally fetches each
 * event's full eventDetailsJson blob + archived-image asset ids for the
 * printable per-type tables. The tRPC path deliberately stays LEAN — the
 * interactive map never renders these fields, and the query is unbounded, so
 * shipping ER JSON blobs + an assets join for every event in range would
 * bloat the live payload for nothing (S2 code-review finding). Lean rows
 * carry eventDetailsJson=null / photoAssetIds=[].
 */
export async function buildEventBreakdownWithCoords(
  tenantId: string,
  input: ReportFilterInput,
  opts?: { includeEventDetails?: boolean },
) {
  const includeEventDetails = opts?.includeEventDetails ?? false;
  const baseSelect = {
    id: true,
    title: true,
    priority: true,
    locationLat: true,
    locationLon: true,
    reportedAt: true,
    reportedByName: true,
    areaName: true,
    hasPhoto: true,
    eventType: { select: { category: true, display: true } },
    municipality: { select: { name: true } },
  } as const;
  const municipalityIds = await resolveMunicipalityScope(tenantId, input);
  const where = eventWhere(tenantId, input, municipalityIds);
  const events = includeEventDetails
    ? await prisma.event.findMany({
        where,
        select: {
          ...baseSelect,
          eventDetailsJson: true,
          assets: {
            where: { telegramFileId: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { id: true, mimeType: true, filename: true },
          },
        },
      })
    : await prisma.event.findMany({ where, select: baseSelect });

  // Union-safe accessors: the lean branch's rows simply lack these props
  // (`id` is present in both branches — it anchors the structural check).
  const detailFields = (e: {
    id: string;
    eventDetailsJson?: unknown;
    assets?: Array<{ id: string; mimeType: string | null; filename: string }>;
  }) => ({
    eventDetailsJson: e.eventDetailsJson ?? null,
    photoAssetIds: photoAssetIdsFrom(e.assets),
  });

  const lawMap: Record<string, { count: number; points: EventPoint[]; events: EventDetail[] }> = {};
  const monMap: Record<string, { count: number; points: EventPoint[]; events: EventDetail[] }> = {};
  let highTotal = 0;
  const highPoints: EventPoint[] = [];
  const highEvents: EventDetail[] = [];

  for (const e of events) {
    const category = e.eventType?.category ?? "uncategorized";
    const display = e.eventType?.display ?? "Unknown";
    const lower = display.toLowerCase();
    const isSerious = SERIOUS_EVENT_PATTERNS.some((p) => lower.includes(p));

    const eventDetail: EventDetail = {
      id: e.id,
      title: e.title,
      typeDisplay: display,
      priority: e.priority,
      reportedAt: e.reportedAt,
      locationName: e.municipality?.name ?? e.areaName ?? null,
      municipalityName: e.municipality?.name ?? null,
      areaName: e.areaName ?? null,
      reportedByName: e.reportedByName ?? null,
      lat: e.locationLat ?? null,
      lon: e.locationLon ?? null,
      hasPhoto: e.hasPhoto,
      ...detailFields(e),
    };

    if (isSerious) {
      highTotal++;
      highEvents.push(eventDetail);
      if (e.locationLat != null && e.locationLon != null) {
        highPoints.push({
          id: e.id,
          title: e.title,
          lat: e.locationLat,
          lon: e.locationLon,
        });
      }
    }

    if (category === LAW_CATEGORY) {
      const bucket = (lawMap[display] ??= { count: 0, points: [], events: [] });
      bucket.count++;
      bucket.events.push(eventDetail);
      if (e.locationLat != null && e.locationLon != null) {
        bucket.points.push({
          id: e.id,
          title: e.title,
          lat: e.locationLat,
          lon: e.locationLon,
        });
      }
    } else if (category === MONITORING_CATEGORY) {
      const bucket = (monMap[display] ??= { count: 0, points: [], events: [] });
      bucket.count++;
      bucket.events.push(eventDetail);
      if (e.locationLat != null && e.locationLon != null) {
        bucket.points.push({
          id: e.id,
          title: e.title,
          lat: e.locationLat,
          lon: e.locationLon,
        });
      }
    }
  }

  return {
    lawEnforcement: Object.entries(lawMap).map(([type, { count, points, events }]) => ({
      type,
      count,
      points,
      events,
    })),
    monitoring: Object.entries(monMap).map(([type, { count, points, events }]) => ({
      type,
      count,
      points,
      events,
    })),
    highPriority: { total: highTotal, points: highPoints, events: highEvents },
  };
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
      const municipalityIds = await resolveMunicipalityScope(ctx.tenantId, input);
      const baseEvent = eventWhere(ctx.tenantId, input, municipalityIds);
      const [totalEvents, lawEnforcementEvents, monitoringEvents, totalPatrols] =
        await Promise.all([
          prisma.event.count({ where: baseEvent }),
          prisma.event.count({
            where: { ...baseEvent, eventType: { category: LAW_CATEGORY } },
          }),
          prisma.event.count({
            where: { ...baseEvent, eventType: { category: MONITORING_CATEGORY } },
          }),
          prisma.patrol.count({
            where: patrolWhere(ctx.tenantId, input, municipalityIds),
          }),
        ]);

      return {
        totalEvents,
        totalPatrols,
        lawEnforcementEvents,
        monitoringEvents,
      };
    }),

  // Patrol list for the selected range — powers the Report Map "Patrols in range"
  // card. One row per patrol with its leader (from the first segment that has
  // one), start/end times, ER title + serial, type, and start coordinates so the
  // card can fly the map to (and render) the selected patrol's track.
  patrolsInRange: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const municipalityIds = await resolveMunicipalityScope(ctx.tenantId, input);
      const rows = await prisma.patrol.findMany({
        where: patrolWhere(ctx.tenantId, input, municipalityIds),
        // Cap raised 300 -> 1200 (owner 2026-07-06: "where can I see the
        // remaining?"). The card is scrollable, so realistic ranges now list
        // every patrol in-card; the "Showing N of M" note only appears past the
        // cap. The absolute-complete list (any size) lives in the generated
        // report's "Patrols — Full List" (uncapped) + the /patrols page.
        take: 1200,
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          title: true,
          serialNumber: true,
          patrolType: true,
          boatName: true,
          startTime: true,
          endTime: true,
          totalDistanceKm: true,
          computedDistanceKm: true,
          totalHours: true,
          computedDurationHours: true,
          startLocationLat: true,
          startLocationLon: true,
          endLocationLat: true,
          endLocationLon: true,
          segments: {
            where: { leaderName: { not: null } },
            orderBy: { actualStart: "asc" },
            select: { leaderName: true },
          },
        },
      });
      return rows.map((p) => {
        const { segments, ...rest } = p;
        const leaders = Array.from(
          new Set(
            segments
              .map((s) => s.leaderName)
              .filter((n): n is string => n != null && n.trim() !== ""),
          ),
        );
        return { ...rest, leaderName: leaders[0] ?? null, leaders };
      });
    }),

  eventBreakdown: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const municipalityIds = await resolveMunicipalityScope(ctx.tenantId, input);
      const events = await prisma.event.findMany({
        where: eventWhere(ctx.tenantId, input, municipalityIds),
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
      const municipalityIds = await resolveMunicipalityScope(ctx.tenantId, input);
      const where = {
        ...eventWhere(ctx.tenantId, input, municipalityIds),
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

  /**
   * Event breakdown WITH geo-points — powers the printable report map's
   * per-category dot overlays (LE, Monitoring, High-Priority clusters).
   * Counts are identical to `eventBreakdown`; `highPriority.total` is identical
   * to `highPriorityEvents.total` for the same filter — both derived in one pass.
   */
  eventBreakdownWithCoords: tenantProcedure
    .input(reportFilterInput)
    .query(({ ctx, input }) =>
      buildEventBreakdownWithCoords(ctx.tenantId, input),
    ),

  /**
   * All event points in range — feeds the Events-Over-Time OVERVIEW map.
   * Same `eventWhere` as every other aggregation (tenant-scoped, Skylight
   * excluded, date + municipality filtered). Points include only events where
   * both lat AND lon are non-null; `total` is the unbounded event count so the
   * caller can show "N events" even when the point list is large.
   */
  allEventPointsInRange: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const municipalityIds = await resolveMunicipalityScope(ctx.tenantId, input);
      const rows = await prisma.event.findMany({
        where: eventWhere(ctx.tenantId, input, municipalityIds),
        select: {
          id: true,
          title: true,
          locationLat: true,
          locationLon: true,
        },
      });

      const points: EventPoint[] = [];
      for (const e of rows) {
        if (e.locationLat != null && e.locationLon != null) {
          points.push({
            id: e.id,
            title: e.title,
            lat: e.locationLat,
            lon: e.locationLon,
          });
        }
      }

      return { total: rows.length, points };
    }),

  /**
   * Patrol track polylines for the Patrol-List print map. Reuses `patrolWhere`
   * (same tenant-scope, date-range, municipality filter as `patrolsInRange`) and
   * reads the materialized PatrolTrack.trackGeojson geometry — the same source
   * the live interactive map's `tracks.inRange` procedure uses. Returns one entry
   * per patrol that has a materialized track with >= 2 renderable points.
   */
  patrolTrackPointsInRange: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const municipalityIds = await resolveMunicipalityScope(ctx.tenantId, input);
      const trackRows = await prisma.patrolTrack.findMany({
        where: {
          tenantId: ctx.tenantId,
          patrol: patrolWhere(ctx.tenantId, input, municipalityIds),
        },
        orderBy: { until: "desc" },
        select: {
          trackGeojson: true,
          patrol: {
            select: {
              id: true,
              title: true,
              serialNumber: true,
            },
          },
        },
      });

      const result: { patrolId: string; label: string; path: { lat: number; lon: number }[] }[] =
        [];
      for (const row of trackRows) {
        const pts = pointsFromTrackGeojson(row.trackGeojson);
        if (pts.length < 2) continue;
        const { id, title, serialNumber } = row.patrol;
        result.push({
          patrolId: id,
          label: title ?? serialNumber ?? id,
          path: pts.map(({ lat, lon }) => ({ lat, lon })),
        });
      }
      return result;
    }),

  /**
   * Daily event + patrol series for the "Events vs Patrols Over Time" line
   * chart. `count` (events, bucketed by `reportedAt`) is the ORIGINAL key —
   * `report-map-view.tsx`'s `totalEvents` reducer reads `d.count`, so it must
   * keep meaning "events". `patrolCount` (patrols, bucketed by `startTime`)
   * is the new series, reusing `patrolWhere` so it honours the same tenant +
   * date + municipality + protected-zone filter as every other aggregation.
   */
  eventsOverTime: tenantProcedure
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const municipalityIds = await resolveMunicipalityScope(ctx.tenantId, input);
      const [events, patrols] = await Promise.all([
        prisma.event.findMany({
          where: eventWhere(ctx.tenantId, input, municipalityIds),
          select: { reportedAt: true },
        }),
        prisma.patrol.findMany({
          where: patrolWhere(ctx.tenantId, input, municipalityIds),
          select: { startTime: true },
        }),
      ]);

      // When both bounds are present, emit a continuous series bucketed
      // adaptively by the requested span (day/week/month — see
      // time-series-bucketing.ts) so the line chart has no gaps and a long
      // range doesn't render hundreds of noisy daily points.
      if (input.from && input.to) {
        const eventDates = events
          .map((e) => e.reportedAt)
          .filter((d): d is Date => d !== null);
        const patrolDates = patrols
          .map((p) => p.startTime)
          .filter((d): d is Date => d !== null);
        return buildEventsPatrolsSeries(
          eventDates,
          patrolDates,
          input.from,
          input.to,
        );
      }

      // No bounds — return only the days that have events or patrols,
      // ascending, still daily (sparse keys), with a uniform `label` field.
      const counts: Record<string, number> = {};
      for (const e of events) {
        if (e.reportedAt === null) continue;
        const key = dayKey(e.reportedAt);
        counts[key] = (counts[key] ?? 0) + 1;
      }

      const patrolCounts: Record<string, number> = {};
      for (const p of patrols) {
        if (p.startTime === null) continue;
        const key = dayKey(p.startTime);
        patrolCounts[key] = (patrolCounts[key] ?? 0) + 1;
      }

      const allKeys = new Set([
        ...Object.keys(counts),
        ...Object.keys(patrolCounts),
      ]);
      return Array.from(allKeys)
        .map((date) => ({
          date,
          label: dayKeyToLabel(date),
          count: counts[date] ?? 0,
          patrolCount: patrolCounts[date] ?? 0,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }),
});
