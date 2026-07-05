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
  charts: {
    lawEnforcement: LawEnforcementChartData;
    monitoring: MonitoringChartData;
    highPriority: HighPriorityChartData;
    patrolList: PatrolListChartData;
    eventsOverTime: EventsOverTimeChartData;
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
 * Flatten every [lon, lat] coordinate out of a Polygon / MultiPolygon geometry.
 * Mirrors the tolerant recursive walker in components/map/InteractiveMap.tsx
 * (geometryCoordinates) — GeoJSON coordinates are [lon, lat].
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
  if (typeof geometry === "object" && geometry !== null) {
    walk((geometry as { coordinates?: unknown }).coordinates);
  }
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
    charts: {
      lawEnforcement,
      monitoring,
      highPriority,
      patrolList,
      eventsOverTime,
    },
  };
}
