/**
 * Server-side data loader for the Report Map PDF render target.
 *
 * Consumed by /print-render/[tenantSlug]/[reportType]/[exportId]/page.tsx when
 * reportType === "report_map". Returns a shaped payload with the tenant, the
 * resolved report template (with logo data URIs), date/filter params, and 5
 * chart payloads derived from the reportMap router's existing procedures.
 *
 * Mirrors the null-contract of get-per-area-report-data.ts. Returns null when:
 *   - the tenant slug does not exist
 *   - the export id does not exist
 *   - the export belongs to a different tenant
 *   - the export's reportType is not "report_map"
 *
 * Template resolution (priority order):
 *   1. paramsJson.templateId — tenant-scoped lookup; if not found, falls to 2.
 *   2. tenant's isDefault template — first where tenantId + isDefault=true.
 *   3. APP_DEFAULT_TEMPLATE — hardcoded fallback (no logos, minimal layout).
 *
 * Logo resolution: municipalLogoKey / partnerLogoKey are fetched from S3 and
 * returned as data URIs for inline embedding in the print body. A missing or
 * inaccessible municipal logo resolves to null — the renderer degrades
 * gracefully. The partner logo NEVER resolves to null: when no
 * partnerLogoKey is set (including the APP_DEFAULT_TEMPLATE path) or the S3
 * fetch fails, it falls back to the bundled BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI
 * — honoring the editor form's "leave empty to use Blue Alliance default"
 * promise (report-template-form.tsx).
 *
 * The 5 charts call Prisma directly (SSR path — no tRPC HTTP overhead).
 * buildEventBreakdownWithCoords from the reportMap router is imported for the
 * three event-based charts so the LE/Monitoring/High-Priority logic stays DRY.
 */

import { prisma } from "@marine-guardian/db";
import { getImageBytes, getExportsBucketName } from "@marine-guardian/storage";
import {
  buildEventBreakdownWithCoords,
  photoAssetIdsFrom,
} from "@/server/trpc/routers/reportMap";
import { pointsFromTrackGeojson } from "@/server/trpc/routers/map";
import { BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI } from "@/server/report-map-report/assets/blue-alliance-default-logo";
import { buildGlobalEventTypeColumns } from "@/server/report-map-report/event-type-grouping";

// ─── Shared point shape ──────────────────────────────────────────────────────

export interface ReportMapEventPoint {
  id: string;
  title: string | null;
  lat: number;
  lon: number;
}

// ─── Per-chart payload shapes ────────────────────────────────────────────────

export interface ReportMapEventDetail {
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
  /** Archived image EventAsset ids, servable via /api/assets/[id]. */
  photoAssetIds: string[];
}

export interface ReportMapEventBreakdownRow {
  type: string;
  count: number;
  points: ReportMapEventPoint[];
  events: ReportMapEventDetail[];
}

export interface LawEnforcementChartData {
  key: "law_enforcement";
  title: string;
  total: number;
  breakdown: ReportMapEventBreakdownRow[];
}

export interface MonitoringChartData {
  key: "monitoring";
  title: string;
  total: number;
  breakdown: ReportMapEventBreakdownRow[];
}

export interface HighPriorityChartData {
  key: "high_priority";
  title: string;
  total: number;
  points: ReportMapEventPoint[];
  events: ReportMapEventDetail[];
}

export interface ReportMapPatrolRow {
  patrolId: string;
  label: string;
  serialNumber: string | null;
  patrolType: string;
  boatName: string | null;
  startTime: Date | null;
  endTime: Date | null;
  distanceKm: number | null;
  hours: number | null;
  /** First leader (backward-compat with the summary table). */
  leaderName: string | null;
  /** All distinct leaders across the patrol's segments, in segment order. */
  leaderNames: string[];
  startLocationLat: number | null;
  startLocationLon: number | null;
}

export interface ReportMapTrackRow {
  patrolId: string;
  label: string;
  path: { lat: number; lon: number }[];
}

export interface PatrolTotals {
  count: number;
  totalHours: number;
  totalKm: number;
}

/** Per-patrol-type aggregate (owner request 2026-07-06): total patrol count,
 *  total hours, and total kilometers for one patrol type ("seaborne"/"foot"),
 *  feeding the "Patrols by Type" bar chart. */
export interface PatrolTypeTotal {
  count: number;
  hours: number;
  km: number;
}

/**
 * Aggregate `patrolBreakdown` rows into per-type totals (seaborne vs foot):
 * total patrol count, total hours, total kilometers. Null `hours`/`distanceKm`
 * are treated as 0. Patrols whose `patrolType` is neither "seaborne" nor
 * "foot" are ignored — this chart only covers the two known patrol types.
 * Exported as a pure helper for unit testing (extracted from the loader body).
 */
export function buildPatrolTypeTotals(
  patrolBreakdown: ReportMapPatrolRow[],
): { seaborne: PatrolTypeTotal; foot: PatrolTypeTotal } {
  const totals = {
    seaborne: { count: 0, hours: 0, km: 0 },
    foot: { count: 0, hours: 0, km: 0 },
  };
  for (const p of patrolBreakdown) {
    if (p.patrolType !== "seaborne" && p.patrolType !== "foot") continue;
    const bucket = totals[p.patrolType];
    bucket.count += 1;
    bucket.hours += p.hours ?? 0;
    bucket.km += p.distanceKm ?? 0;
  }
  return totals;
}

export interface PatrolListChartData {
  key: "patrol_list";
  title: string;
  total: number;
  breakdown: ReportMapPatrolRow[];
  tracks: ReportMapTrackRow[];
  patrolTotals: PatrolTotals;
  patrolCountByTypeOverTime: {
    seaborne: ReportMapTimeSeriesPoint[];
    foot: ReportMapTimeSeriesPoint[];
  };
}

export interface ReportMapTimeSeriesPoint {
  date: string;
  count: number;
}

export interface EventsOverTimeChartData {
  key: "events_over_time";
  title: string;
  total: number;
  series: ReportMapTimeSeriesPoint[];
  overviewPoints: ReportMapEventPoint[];
  events: ReportMapEventDetail[];
}

// ─── Template + top-level payload ───────────────────────────────────────────

export interface ReportMapTemplate {
  id: string | null;
  name: string;
  layout: string;
  reportTitle: string;
  footerNotes: string | null;
  municipalLogoDataUri: string | null;
  /** Never null — falls back to the bundled Blue Alliance default logo. */
  partnerLogoDataUri: string;
}

/** Lat/lon bounding box, in plain-number form (serializable across the RSC
 *  boundary — unlike a Leaflet LatLngBounds instance). */
export interface ReportMapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface ReportMapReportData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  filter: {
    from: Date | undefined;
    to: Date | undefined;
    municipalityId: string | undefined;
    protectedZoneId: string | undefined;
  };
  generatedAt: Date;
  template: ReportMapTemplate;
  /** Set when filter.municipalityId resolves to a Municipality with geometry
   *  (boundaryGeojson ∪ waterGeojson). Null for an "All municipalities" /
   *  regional report, or when the municipality has no geometry — the print
   *  maps then keep the existing fit-to-data-points behavior. */
  municipalityBounds: ReportMapBounds | null;
  /**
   * Per-event-type-display GLOBAL (all-time, tenant-wide) ordered detail-key
   * list — owner Option A (2026-07-06): every printable report's per-type
   * event table renders this SAME standard column set, regardless of how
   * sparsely the report's own filtered event subset is populated. Keyed by
   * EventType.display; only covers the types actually appearing somewhere in
   * this report. See `groupEventsByType`'s `typeColumns` parameter.
   */
  eventTypeColumns: Record<string, string[]>;
  charts: {
    lawEnforcement: LawEnforcementChartData;
    monitoring: MonitoringChartData;
    highPriority: HighPriorityChartData;
    patrolList: PatrolListChartData;
    eventsOverTime: EventsOverTimeChartData;
    /** Per-patrol-type totals (seaborne/foot) — feeds the "Patrols by Type"
     *  bar chart in the Patrol List section. */
    patrolTypeTotals: { seaborne: PatrolTypeTotal; foot: PatrolTypeTotal };
  };
}

// ─── App-default template (no logos, minimal layout) ─────────────────────────

const APP_DEFAULT_TEMPLATE = {
  id: null as string | null,
  name: "Default",
  layout: "two-column",
  reportTitle: "Marine Guardian Report",
  footerNotes: null as string | null,
  municipalLogoKey: null as string | null,
  partnerLogoKey: null as string | null,
};

// ─── Param parsing ────────────────────────────────────────────────────────────

interface ParsedReportMapParams {
  templateId?: string;
  from?: Date;
  to?: Date;
  municipalityId?: string;
  protectedZoneId?: string;
}

export function parseReportMapParams(paramsJson: unknown): ParsedReportMapParams {
  if (typeof paramsJson !== "object" || paramsJson === null) return {};
  const p = paramsJson as Record<string, unknown>;
  const out: ParsedReportMapParams = {};
  if (typeof p.templateId === "string" && p.templateId.length > 0) {
    out.templateId = p.templateId;
  }
  if (typeof p.from === "string") {
    const d = new Date(p.from);
    if (!Number.isNaN(d.getTime())) out.from = d;
  }
  if (typeof p.to === "string") {
    const d = new Date(p.to);
    if (!Number.isNaN(d.getTime())) out.to = d;
  }
  if (typeof p.municipalityId === "string" && p.municipalityId.length > 0) {
    out.municipalityId = p.municipalityId;
  }
  if (typeof p.protectedZoneId === "string" && p.protectedZoneId.length > 0) {
    out.protectedZoneId = p.protectedZoneId;
  }
  return out;
}

// ─── Logo resolution ──────────────────────────────────────────────────────────

async function resolveLogoDataUri(key: string | null | undefined): Promise<string | null> {
  if (key == null) return null;
  try {
    const bucket = getExportsBucketName();
    const bytes = await getImageBytes({ bucket, key });
    const ext = key.split(".").pop()?.toLowerCase() ?? "png";
    const contentType =
      ext === "jpeg" || ext === "jpg" ? "image/jpeg" : "image/png";
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// ─── Municipality bounds helper ──────────────────────────────────────────────

/**
 * Flatten every [lon, lat] coordinate out of a GeoJSON value. Handles both bare
 * geometries (Polygon / MultiPolygon with a top-level `coordinates`) AND the
 * wrapper shapes actually stored in the Municipality Json columns — seed data is
 * a **FeatureCollection** (`{ features: [{ geometry: { coordinates } }] }`), so a
 * top-level-`coordinates`-only walker returns nothing and the map silently falls
 * back to the whole-region view. Descends through FeatureCollection (`features`),
 * Feature (`geometry`), and GeometryCollection (`geometries`). GeoJSON
 * coordinates are [lon, lat].
 */
function geometryCoordinates(geometry: unknown): [number, number][] {
  const out: [number, number][] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      out.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  const extract = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as {
      coordinates?: unknown;
      features?: unknown;
      geometry?: unknown;
      geometries?: unknown;
    };
    if (n.coordinates !== undefined) walk(n.coordinates);
    if (Array.isArray(n.features)) for (const f of n.features) extract(f);
    if (n.geometry !== undefined) extract(n.geometry);
    if (Array.isArray(n.geometries)) for (const g of n.geometries) extract(g);
  };
  extract(geometry);
  return out;
}

/**
 * Union every coordinate from one or more GeoJSON geometries (Polygon /
 * MultiPolygon, loosely typed as stored in Prisma Json columns) into a single
 * lat/lon bounding box. Returns null when no well-formed coordinate was
 * found in any input geometry — callers fall back to the data-point fit.
 */
export function unionGeometryBounds(
  ...geometries: unknown[]
): ReportMapBounds | null {
  let south = Number.POSITIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const geometry of geometries) {
    for (const [lon, lat] of geometryCoordinates(geometry)) {
      found = true;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
    }
  }

  if (!found) return null;
  return { south, west, north, east };
}

// ─── Day-key helper (mirrors reportMap.ts local fn) ──────────────────────────

function dayKey(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Main loader ──────────────────────────────────────────────────────────────

export async function getReportMapReportData(
  tenantSlug: string,
  exportId: string,
): Promise<ReportMapReportData | null> {
  // 1. Tenant + export guard (same null contract as per-area loader)
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, timezone: true },
  });
  if (tenant === null) return null;

  const reportExport = await prisma.reportExport.findUnique({
    where: { id: exportId },
    select: { tenantId: true, reportType: true, paramsJson: true },
  });
  if (reportExport === null) return null;
  if (reportExport.tenantId !== tenant.id) return null;
  if (reportExport.reportType !== "report_map") return null;

  // 2. Parse params + resolve template
  const params = parseReportMapParams(reportExport.paramsJson);

  const templateSelect = {
    id: true,
    name: true,
    layout: true,
    reportTitle: true,
    footerNotes: true,
    municipalLogoKey: true,
    partnerLogoKey: true,
  } as const;

  let rawTemplate: {
    id: string;
    name: string;
    layout: string;
    reportTitle: string;
    footerNotes: string | null;
    municipalLogoKey: string | null;
    partnerLogoKey: string | null;
  } | null = null;

  if (params.templateId !== undefined) {
    rawTemplate = await prisma.reportTemplate.findFirst({
      where: { id: params.templateId, tenantId: tenant.id },
      select: templateSelect,
    });
  }

  if (rawTemplate === null) {
    rawTemplate =
      (await prisma.reportTemplate.findFirst({
        where: { tenantId: tenant.id, isDefault: true },
        select: templateSelect,
      })) ?? null;
  }

  const templateSource = rawTemplate ?? APP_DEFAULT_TEMPLATE;

  // 3. Build filter input (mirrors reportMap.ts eventWhere / patrolWhere shapes)
  const filterInput = {
    from: params.from,
    to: params.to,
    municipalityId: params.municipalityId,
    protectedZoneId: params.protectedZoneId,
  };

  const eventFilter: {
    tenantId: string;
    NOT: { eventType: { display: { contains: string; mode: "insensitive" } } };
    reportedAt?: { gte?: Date; lte?: Date };
    municipalityId?: string;
    coveredZones?: { some: { protectedZoneId: string } };
  } = {
    tenantId: tenant.id,
    NOT: {
      eventType: { display: { contains: "skylight", mode: "insensitive" } },
    },
  };
  if (params.from !== undefined || params.to !== undefined) {
    const reportedAt: { gte?: Date; lte?: Date } = {};
    if (params.from !== undefined) reportedAt.gte = params.from;
    if (params.to !== undefined) reportedAt.lte = params.to;
    eventFilter.reportedAt = reportedAt;
  }
  if (params.municipalityId !== undefined) {
    eventFilter.municipalityId = params.municipalityId;
  }
  if (params.protectedZoneId !== undefined) {
    eventFilter.coveredZones = { some: { protectedZoneId: params.protectedZoneId } };
  }

  const patrolFilter: {
    tenantId: string;
    isDeleted: false;
    isTestPatrol: false;
    startTime?: { gte?: Date; lte?: Date };
    municipalityId?: string;
    coveredZones?: { some: { protectedZoneId: string } };
  } = { tenantId: tenant.id, isDeleted: false, isTestPatrol: false };
  if (params.from !== undefined || params.to !== undefined) {
    const startTime: { gte?: Date; lte?: Date } = {};
    if (params.from !== undefined) startTime.gte = params.from;
    if (params.to !== undefined) startTime.lte = params.to;
    patrolFilter.startTime = startTime;
  }
  if (params.municipalityId !== undefined) {
    patrolFilter.municipalityId = params.municipalityId;
  }
  if (params.protectedZoneId !== undefined) {
    patrolFilter.coveredZones = { some: { protectedZoneId: params.protectedZoneId } };
  }

  // 4. Fetch logos + all chart data + municipality geometry concurrently
  // (all independent reads).
  const [
    [municipalLogoDataUri, resolvedPartnerLogoDataUri],
    [breakdown, allEventRows, patrolRows, trackRows],
    municipalityGeometry,
  ] = await Promise.all([
    // Logo S3 reads — null on missing or S3 error (graceful degradation).
    // Partner logo is coalesced to the bundled Blue Alliance default below —
    // it must never reach the renderer as null.
    Promise.all([
      resolveLogoDataUri(templateSource.municipalLogoKey),
      resolveLogoDataUri(templateSource.partnerLogoKey),
    ]),
    // Chart data — all four Prisma queries concurrently
    Promise.all([
      // LE / Monitoring / High Priority — via exported S0 helper (single query,
      // DRY). includeEventDetails: the print per-type tables render each
      // event's full ER field set + photo thumbnails (S2); the tRPC path
      // stays lean.
      buildEventBreakdownWithCoords(tenant.id, filterInput, {
        includeEventDetails: true,
      }),
      // Events Over Time overview points + series source + full event detail
      // (NO LIMIT — the report's full-list portrait table needs every row).
      prisma.event.findMany({
        where: eventFilter,
        select: {
          id: true,
          title: true,
          priority: true,
          locationLat: true,
          locationLon: true,
          reportedAt: true,
          reportedByName: true,
          areaName: true,
          eventDetailsJson: true,
          hasPhoto: true,
          eventType: { select: { display: true } },
          municipality: { select: { name: true } },
          assets: {
            where: { telegramFileId: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { id: true, mimeType: true, filename: true },
          },
        },
      }),
      // Patrol List breakdown — NO LIMIT (the full-list portrait table needs
      // every patrol; the 300-row cap stays ONLY on the track-polyline query
      // below, which feeds the map, not the list).
      prisma.patrol.findMany({
        where: patrolFilter,
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
          segments: {
            where: { leaderName: { not: null } },
            orderBy: { actualStart: "asc" },
            select: { leaderName: true },
          },
        },
      }),
      // Patrol track polylines
      prisma.patrolTrack.findMany({
        where: { tenantId: tenant.id, patrol: patrolFilter },
        take: 300,
        orderBy: { until: "desc" },
        select: {
          trackGeojson: true,
          patrol: { select: { id: true, title: true, serialNumber: true } },
        },
      }),
    ]),
    // Municipality boundary + water geometry — only when the report is
    // scoped to a specific municipality. Feeds municipalityBounds below so
    // the print maps frame that municipality instead of the whole region.
    params.municipalityId !== undefined
      ? prisma.municipality.findUnique({
          where: { id: params.municipalityId },
          select: { boundaryGeojson: true, waterGeojson: true },
        })
      : Promise.resolve(null),
  ] as const);

  const municipalityBounds: ReportMapBounds | null = municipalityGeometry
    ? unionGeometryBounds(
        municipalityGeometry.boundaryGeojson,
        municipalityGeometry.waterGeojson,
      )
    : null;

  // Partner logo default fallback: the editor form promises "leave empty to
  // use Blue Alliance default" (report-template-form.tsx) — honor it here so
  // partnerLogoDataUri is NEVER null, covering: no partnerLogoKey set, an
  // S3-fetch failure, and the APP_DEFAULT_TEMPLATE fallback path.
  const partnerLogoDataUri =
    resolvedPartnerLogoDataUri ?? BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI;

  const template: ReportMapTemplate = {
    id: templateSource.id,
    name: templateSource.name,
    layout: templateSource.layout,
    reportTitle: templateSource.reportTitle,
    footerNotes: templateSource.footerNotes,
    municipalLogoDataUri,
    partnerLogoDataUri,
  };

  // ─── Law Enforcement chart ────────────────────────────────────────────────
  const lawTotal = breakdown.lawEnforcement.reduce((s, r) => s + r.count, 0);
  const lawEnforcement: LawEnforcementChartData = {
    key: "law_enforcement",
    title: "Law Enforcement",
    total: lawTotal,
    breakdown: breakdown.lawEnforcement,
  };

  // ─── Monitoring chart ─────────────────────────────────────────────────────
  const monTotal = breakdown.monitoring.reduce((s, r) => s + r.count, 0);
  const monitoring: MonitoringChartData = {
    key: "monitoring",
    title: "Monitoring",
    total: monTotal,
    breakdown: breakdown.monitoring,
  };

  // ─── High Priority chart ──────────────────────────────────────────────────
  const highPriority: HighPriorityChartData = {
    key: "high_priority",
    title: "High Priority Events",
    total: breakdown.highPriority.total,
    points: breakdown.highPriority.points,
    events: breakdown.highPriority.events,
  };

  // ─── Patrol List chart ────────────────────────────────────────────────────
  const patrolBreakdown: ReportMapPatrolRow[] = patrolRows.map((p) => {
    const leaders = Array.from(
      new Set(
        p.segments
          .map((s) => s.leaderName)
          .filter((n): n is string => n != null && n.trim() !== ""),
      ),
    );
    return {
      patrolId: p.id,
      label: p.title ?? p.serialNumber ?? p.id,
      serialNumber: p.serialNumber,
      patrolType: p.patrolType,
      boatName: p.boatName ?? null,
      startTime: p.startTime,
      endTime: p.endTime,
      // Prefer haversine-recomputed distance (v2) over ER-supplied total
      distanceKm: p.computedDistanceKm ?? p.totalDistanceKm,
      // Prefer haversine-recomputed duration (v2) over ER-supplied total
      hours: p.computedDurationHours ?? p.totalHours ?? null,
      leaderName: leaders[0] ?? null,
      leaderNames: leaders,
      startLocationLat: p.startLocationLat ?? null,
      startLocationLon: p.startLocationLon ?? null,
    };
  });

  const patrolTotals: PatrolTotals = {
    count: patrolBreakdown.length,
    totalHours: patrolBreakdown.reduce((s, p) => s + (p.hours ?? 0), 0),
    // Use already-coalesced distanceKm from patrolBreakdown for consistent source
    totalKm: patrolBreakdown.reduce((s, p) => s + (p.distanceKm ?? 0), 0),
  };

  // Bucket patrols by startTime day and patrolType
  const seaborneDayCounts: Record<string, number> = {};
  const footDayCounts: Record<string, number> = {};
  for (const p of patrolRows) {
    if (p.startTime === null) continue;
    const k = dayKey(p.startTime);
    if (p.patrolType === "seaborne") {
      seaborneDayCounts[k] = (seaborneDayCounts[k] ?? 0) + 1;
    } else {
      footDayCounts[k] = (footDayCounts[k] ?? 0) + 1;
    }
  }
  const sortEntries = (counts: Record<string, number>): ReportMapTimeSeriesPoint[] =>
    Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const patrolCountByTypeOverTime = {
    seaborne: sortEntries(seaborneDayCounts),
    foot: sortEntries(footDayCounts),
  };

  const tracks: ReportMapTrackRow[] = [];
  for (const row of trackRows) {
    const pts = pointsFromTrackGeojson(row.trackGeojson);
    if (pts.length < 2) continue;
    tracks.push({
      patrolId: row.patrol.id,
      label: row.patrol.title ?? row.patrol.serialNumber ?? row.patrol.id,
      path: pts.map(({ lat, lon }) => ({ lat, lon })),
    });
  }

  const patrolList: PatrolListChartData = {
    key: "patrol_list",
    title: "Patrol List",
    total: patrolRows.length,
    breakdown: patrolBreakdown,
    tracks,
    patrolTotals,
    patrolCountByTypeOverTime,
  };

  const patrolTypeTotals = buildPatrolTypeTotals(patrolBreakdown);

  // ─── Events Over Time chart ───────────────────────────────────────────────
  const overviewPoints: ReportMapEventPoint[] = [];
  const overviewEvents: ReportMapEventDetail[] = [];
  const dayCounts: Record<string, number> = {};

  for (const e of allEventRows) {
    if (e.reportedAt !== null) {
      const k = dayKey(e.reportedAt);
      dayCounts[k] = (dayCounts[k] ?? 0) + 1;
    }
    if (e.locationLat != null && e.locationLon != null) {
      overviewPoints.push({
        id: e.id,
        title: e.title,
        lat: e.locationLat,
        lon: e.locationLon,
      });
    }
    overviewEvents.push({
      id: e.id,
      title: e.title,
      typeDisplay: e.eventType?.display ?? "Unknown",
      priority: e.priority,
      reportedAt: e.reportedAt,
      locationName: e.municipality?.name ?? e.areaName ?? null,
      municipalityName: e.municipality?.name ?? null,
      areaName: e.areaName ?? null,
      reportedByName: e.reportedByName ?? null,
      lat: e.locationLat ?? null,
      lon: e.locationLon ?? null,
      eventDetailsJson: e.eventDetailsJson,
      hasPhoto: e.hasPhoto,
      photoAssetIds: photoAssetIdsFrom(e.assets),
    });
  }

  let series: ReportMapTimeSeriesPoint[];
  if (params.from !== undefined && params.to !== undefined) {
    // Emit a continuous daily series (zero-fill gaps) so the line chart has no holes
    series = [];
    const cursor = new Date(
      params.from.getFullYear(),
      params.from.getMonth(),
      params.from.getDate(),
    );
    const end = new Date(
      params.to.getFullYear(),
      params.to.getMonth(),
      params.to.getDate(),
    );
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 400) {
      const k = dayKey(cursor);
      series.push({ date: k, count: dayCounts[k] ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
  } else {
    series = Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  const eventsOverTime: EventsOverTimeChartData = {
    key: "events_over_time",
    title: "Events Over Time",
    total: allEventRows.length,
    series,
    overviewPoints,
    events: overviewEvents,
  };

  // ─── Global (all-time) per-event-type column set (owner Option A) ─────────
  // The report's own filtered event subset can be too sparse to reveal a
  // type's full standard field set (root cause of the inconsistent-columns
  // complaint). Instead of deriving detailKeys from just this report's
  // events, run ONE additional lean query for ALL of the tenant's events
  // (all-time, unfiltered by date/municipality/zone) whose event type is one
  // of the types that actually appear somewhere in THIS report — bounded to
  // that set so we never fetch unrelated event types.
  const eventTypeDisplays = new Set<string>();
  for (const row of breakdown.lawEnforcement) {
    for (const e of row.events) eventTypeDisplays.add(e.typeDisplay);
  }
  for (const row of breakdown.monitoring) {
    for (const e of row.events) eventTypeDisplays.add(e.typeDisplay);
  }
  for (const e of breakdown.highPriority.events) eventTypeDisplays.add(e.typeDisplay);
  for (const e of overviewEvents) eventTypeDisplays.add(e.typeDisplay);

  let eventTypeColumns: Record<string, string[]> = {};
  if (eventTypeDisplays.size > 0) {
    const globalDetailRows = await prisma.event.findMany({
      where: {
        tenantId: tenant.id,
        eventType: { display: { in: Array.from(eventTypeDisplays) } },
      },
      select: {
        eventDetailsJson: true,
        eventType: { select: { display: true } },
      },
    });
    eventTypeColumns = buildGlobalEventTypeColumns(
      globalDetailRows.map((r) => ({
        typeDisplay: r.eventType?.display ?? "Unknown",
        eventDetailsJson: r.eventDetailsJson,
      })),
    );
  }

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
    },
    filter: filterInput,
    generatedAt: new Date(),
    template,
    municipalityBounds,
    eventTypeColumns,
    charts: {
      lawEnforcement,
      monitoring,
      highPriority,
      patrolList,
      eventsOverTime,
      patrolTypeTotals,
    },
  };
}
