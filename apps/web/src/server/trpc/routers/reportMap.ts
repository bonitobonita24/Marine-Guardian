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
import { matrixProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import { isInlineSafeImageAsset } from "@marine-guardian/shared/lib/asset-mime";
import { SERIOUS_EVENT_PATTERNS } from "@/components/map/eventMarkerStyle";
import { pointsFromTrackGeojson } from "./map";
import { buildEventsPatrolsSeries, dayKeyToLabel } from "./time-series-bucketing";
import {
  buildScopeWhere,
  loadScopeGeometries,
  resolveReportScope,
  type ReportScope,
} from "../../reporting/report-scope";
import {
  sumTraversingCoverageAcrossMembers,
  type TraversingWindow,
} from "../../reporting/traversing-coverage";

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
    // Optional "include child boundaries" toggle (2026-07-09, Phase 4B): when
    // true AND a municipality scope is active, folds events/patrols sitting in
    // that municipality's child zones (MPA/hotspot/custom, via coveredZones)
    // into the report — typically offshore MPA rows with no exclusive
    // municipalityId. No-op when no municipality scope is set.
    includeChildren: z.boolean().optional(),
    // Traversing-patrols toggle (2026-07-16, province scope added same day):
    // when true AND a municipality scope is active (a single `municipalityId`
    // OR a `province` rollup resolving to one-or-more member municipalities),
    // the `summary` KPI totals additionally fold in the clipped in-boundary
    // distance/hours of patrols that physically pass THROUGH a scoped
    // municipality without being attributed to it (attributed elsewhere, or
    // unattributed). For a province rollup, coverage is summed per-member —
    // a patrol crossing member B is credited to B even if it originated in
    // member A of the same province. Patrol COUNT stays attributed-only — see
    // `summary`'s doc comment for the full owner-locked semantics. No-op when
    // no municipality scope is resolved at all.
    includeTraversing: z.boolean().optional(),
  })
  .strict();

type ReportFilterInput = z.infer<typeof reportFilterInput>;

/**
 * Event where-clause shared by every report aggregation: tenant-scoped, Skylight
 * excluded (markers exclude it too), optional reportedAt range + boundary scope.
 *
 * The boundary portion now comes from the shared `buildScopeWhere(scope)`
 * (report-scope.ts) instead of being re-derived here. That helper is
 * behaviour-identical to the code it replaces: it sets the municipality clause
 * via the same `buildMunicipalityScopeWhere` and, INDEPENDENTLY on a different
 * key, `coveredZones` for an explicitly-selected zone — so the two AND
 * together exactly as before. Non-traversing numbers therefore do not move.
 */
function eventWhere(
  tenantId: string,
  input: ReportFilterInput,
  scope: ReportScope,
) {
  const where: {
    tenantId: string;
    NOT: { eventType: { display: { contains: string; mode: "insensitive" } } };
    reportedAt?: { gte?: Date; lte?: Date };
    municipalityId?: string | { in: string[] };
    OR?: [
      { municipalityId: string | { in: string[] } },
      { coveredZones: { some: { protectedZoneId: { in: string[] } } } },
    ];
    coveredZones?: { some: { protectedZoneId: string } };
    terrain?: string;
  } = {
    tenantId,
    NOT: {
      eventType: { display: { contains: "skylight", mode: "insensitive" } },
    },
    ...buildScopeWhere(scope),
  };
  const reportedAt: { gte?: Date; lte?: Date } = {};
  if (input.from !== undefined) reportedAt.gte = input.from;
  if (input.to !== undefined) reportedAt.lte = input.to;
  if (reportedAt.gte !== undefined || reportedAt.lte !== undefined) {
    where.reportedAt = reportedAt;
  }
  if (input.terrain !== undefined) {
    where.terrain = input.terrain;
  }
  return where;
}

/**
 * Patrol where-clause: non-deleted, non-test, optional startTime + boundary
 * scope. Same shared `buildScopeWhere(scope)` as `eventWhere` above — see that
 * function's note on behaviour-identity.
 *
 * NOTE (owner Rule 2): this clause is what `totalPatrols` counts, and it is
 * ATTRIBUTION-based. Traversing NEVER widens it — a patrol is counted only at
 * the boundary where it STARTED.
 */
function patrolWhere(
  tenantId: string,
  input: ReportFilterInput,
  scope: ReportScope,
) {
  const where: {
    tenantId: string;
    isDeleted: false;
    isTestPatrol: false;
    startTime?: { gte?: Date; lte?: Date };
    municipalityId?: string | { in: string[] };
    OR?: [
      { municipalityId: string | { in: string[] } },
      { coveredZones: { some: { protectedZoneId: { in: string[] } } } },
    ];
    coveredZones?: { some: { protectedZoneId: string } };
    terrain?: string;
  } = {
    tenantId,
    isDeleted: false,
    isTestPatrol: false,
    ...buildScopeWhere(scope),
  };
  const startTime: { gte?: Date; lte?: Date } = {};
  if (input.from !== undefined) startTime.gte = input.from;
  if (input.to !== undefined) startTime.lte = input.to;
  if (startTime.gte !== undefined || startTime.lte !== undefined) {
    where.startTime = startTime;
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
  const scope = await resolveReportScope(tenantId, input);
  const where = eventWhere(tenantId, input, scope);
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
  /**
   * KPI totals for the Report Map summary tiles. `totalPatrols` is (and always
   * has been) ATTRIBUTED-only — a patrol counts once, at its origin
   * municipality — and that never changes.
   *
   * `totalDistanceKm` / `totalHours` are the attributed patrols' coalesced
   * (computed-preferred, ER-fallback) distance/hours sum. When
   * `includeTraversing` is true these two totals ALSO fold in the clipped
   * in-boundary distance/hours of patrols that pass THROUGH the scope without
   * being attributed to it — owner Rule 2: "all those patrols time and
   * distances that passes to the selected Province/Municipality boundary **or
   * to its MPA zones** must be added to the report, except for patrol count
   * because ... the patrol count must only for the boundary where it started."
   *
   * The traversing scope is now the SAME scope as the base totals (via
   * `resolveReportScope` + `loadScopeGeometries`), at every level:
   *   - zone selected      → coverage clipped to that ZONE only;
   *   - municipality/province with includeChildren → members are the
   *     municipalities ∪ their child zones, de-overlapped by containment;
   *   - municipality/province otherwise → per-member municipality coverage,
   *     as before.
   * `totalPatrols` is left untouched by the toggle at every level.
   */
  summary: matrixProcedure(tenantProcedure, "exports", "view")
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveReportScope(ctx.tenantId, input);
      const baseEvent = eventWhere(ctx.tenantId, input, scope);
      const basePatrolWhere = patrolWhere(ctx.tenantId, input, scope);
      const [totalEvents, lawEnforcementEvents, monitoringEvents, totalPatrols, attributedPatrolTotals] =
        await Promise.all([
          prisma.event.count({ where: baseEvent }),
          prisma.event.count({
            where: { ...baseEvent, eventType: { category: LAW_CATEGORY } },
          }),
          prisma.event.count({
            where: { ...baseEvent, eventType: { category: MONITORING_CATEGORY } },
          }),
          prisma.patrol.count({ where: basePatrolWhere }),
          // Distance/hours totals — a second, narrow read (count() cannot
          // aggregate the computed-preferred/ER-fallback coalesce below), same
          // where clause as the count above.
          prisma.patrol.findMany({
            where: basePatrolWhere,
            select: {
              totalDistanceKm: true,
              computedDistanceKm: true,
              totalHours: true,
              computedDurationHours: true,
            },
          }),
        ]);

      let totalDistanceKm = 0;
      let totalHours = 0;
      for (const p of attributedPatrolTotals) {
        totalDistanceKm += p.computedDistanceKm ?? p.totalDistanceKm ?? 0;
        totalHours += p.computedDurationHours ?? p.totalHours ?? 0;
      }

      // Traversing-patrols fold-in — computed at the SAME scope as the base
      // totals above.
      //
      // THE BUG THIS FIXES: this used to call the municipality-resolving
      // `sumTraversingCoverageAcross(tenantId, window, municipalityIds)`,
      // which never saw `protectedZoneId` / the child-zone set and clipped to
      // WHOLE municipalities. On a zone-scoped report the tile then summed
      // (patrols narrowed to the zone) + (traversing coverage over the entire
      // parent municipality) — two different scopes in one number, over-
      // reporting by roughly a municipality's worth of coverage.
      //
      // `loadScopeGeometries` applies the smallest-explicit-boundary rule:
      // ZONE members only at zone level, municipalities ∪ child zones when
      // includeChildren is on. The parent/child overlap is de-overlapped
      // inside `sumTraversingCoverageAcrossMembers` (containment rule) — do
      // NOT attempt to de-overlap the member list here. Origin exclusion,
      // including zone-level origins via Patrol.startLocationLat/Lon, is
      // likewise handled in that helper's own patrol read.
      if (scope.includeTraversing) {
        const members = await loadScopeGeometries(ctx.tenantId, scope);
        if (members.length > 0) {
          const traversingWindow: TraversingWindow = {};
          if (input.from !== undefined) traversingWindow.from = input.from;
          if (input.to !== undefined) traversingWindow.to = input.to;
          const traversing = await sumTraversingCoverageAcrossMembers(
            ctx.tenantId,
            traversingWindow,
            members,
          );
          // DISTANCE + HOURS ONLY. `totalPatrols` above is a plain
          // `patrol.count` on the attributed where-clause and is deliberately
          // NOT touched here (owner Rule 2: "the patrol count must only for
          // the boundary where it started"). Events are untouched entirely —
          // `includeTraversing` appears in no event where-clause.
          totalDistanceKm += traversing.km;
          totalHours += traversing.hours;
        }
      }

      return {
        totalEvents,
        totalPatrols,
        lawEnforcementEvents,
        monitoringEvents,
        totalDistanceKm,
        totalHours,
      };
    }),

  // Patrol list for the selected range — powers the Report Map "Patrols in range"
  // card. One row per patrol with its leader (from the first segment that has
  // one), start/end times, ER title + serial, type, and start coordinates so the
  // card can fly the map to (and render) the selected patrol's track.
  patrolsInRange: matrixProcedure(tenantProcedure, "exports", "view")
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveReportScope(ctx.tenantId, input);
      const rows = await prisma.patrol.findMany({
        where: patrolWhere(ctx.tenantId, input, scope),
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

  eventBreakdown: matrixProcedure(tenantProcedure, "exports", "view")
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveReportScope(ctx.tenantId, input);
      const events = await prisma.event.findMany({
        where: eventWhere(ctx.tenantId, input, scope),
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
  highPriorityEvents: matrixProcedure(tenantProcedure, "exports", "view")
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveReportScope(ctx.tenantId, input);
      const { OR: scopeOr, ...baseWhere } = eventWhere(ctx.tenantId, input, scope);
      const seriousOr = SERIOUS_EVENT_PATTERNS.map((p) => ({
        eventType: {
          display: { contains: p, mode: "insensitive" as const },
        },
      }));
      // eventWhere may itself carry an `OR` (municipality + child-zone scope
      // widening — Phase 4B); Prisma objects can only have one `OR` key, so
      // when both are present combine via `AND` instead of clobbering one.
      const where = scopeOr
        ? { ...baseWhere, AND: [{ OR: scopeOr }, { OR: seriousOr }] }
        : { ...baseWhere, OR: seriousOr };

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
  eventBreakdownWithCoords: matrixProcedure(tenantProcedure, "exports", "view")
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
  allEventPointsInRange: matrixProcedure(tenantProcedure, "exports", "view")
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveReportScope(ctx.tenantId, input);
      const rows = await prisma.event.findMany({
        where: eventWhere(ctx.tenantId, input, scope),
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
  patrolTrackPointsInRange: matrixProcedure(tenantProcedure, "exports", "view")
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveReportScope(ctx.tenantId, input);
      const trackRows = await prisma.patrolTrack.findMany({
        where: {
          tenantId: ctx.tenantId,
          patrol: patrolWhere(ctx.tenantId, input, scope),
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
  eventsOverTime: matrixProcedure(tenantProcedure, "exports", "view")
    .input(reportFilterInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveReportScope(ctx.tenantId, input);
      const [events, patrols] = await Promise.all([
        prisma.event.findMany({
          where: eventWhere(ctx.tenantId, input, scope),
          select: { reportedAt: true },
        }),
        prisma.patrol.findMany({
          where: patrolWhere(ctx.tenantId, input, scope),
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
