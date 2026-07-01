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
 * inaccessible logo resolves to null — the renderer degrades gracefully.
 *
 * The 5 charts call Prisma directly (SSR path — no tRPC HTTP overhead).
 * buildEventBreakdownWithCoords from the reportMap router is imported for the
 * three event-based charts so the LE/Monitoring/High-Priority logic stays DRY.
 */

import { prisma } from "@marine-guardian/db";
import { getImageBytes, getExportsBucketName } from "@marine-guardian/storage";
import { buildEventBreakdownWithCoords } from "@/server/trpc/routers/reportMap";
import { pointsFromTrackGeojson } from "@/server/trpc/routers/map";

// ─── Shared point shape ──────────────────────────────────────────────────────

export interface ReportMapEventPoint {
  id: string;
  title: string | null;
  lat: number;
  lon: number;
}

// ─── Per-chart payload shapes ────────────────────────────────────────────────

export interface ReportMapEventBreakdownRow {
  type: string;
  count: number;
  points: ReportMapEventPoint[];
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
}

export interface ReportMapPatrolRow {
  patrolId: string;
  label: string;
  serialNumber: string | null;
  patrolType: string;
  startTime: Date | null;
  endTime: Date | null;
  distanceKm: number | null;
  leaderName: string | null;
}

export interface ReportMapTrackRow {
  patrolId: string;
  label: string;
  path: { lat: number; lon: number }[];
}

export interface PatrolListChartData {
  key: "patrol_list";
  title: string;
  total: number;
  breakdown: ReportMapPatrolRow[];
  tracks: ReportMapTrackRow[];
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
}

// ─── Template + top-level payload ───────────────────────────────────────────

export interface ReportMapTemplate {
  id: string | null;
  name: string;
  layout: string;
  reportTitle: string;
  footerNotes: string | null;
  municipalLogoDataUri: string | null;
  partnerLogoDataUri: string | null;
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

  // 4. Fetch logos + all chart data concurrently (logos and charts are independent)
  const [
    [municipalLogoDataUri, partnerLogoDataUri],
    [breakdown, allEventRows, patrolRows, trackRows],
  ] = await Promise.all([
    // Logo S3 reads — null on missing or S3 error (graceful degradation)
    Promise.all([
      resolveLogoDataUri(templateSource.municipalLogoKey),
      resolveLogoDataUri(templateSource.partnerLogoKey),
    ]),
    // Chart data — all four Prisma queries concurrently
    Promise.all([
      // LE / Monitoring / High Priority — via exported S0 helper (single query, DRY)
      buildEventBreakdownWithCoords(tenant.id, filterInput),
      // Events Over Time overview points + series source
      prisma.event.findMany({
        where: eventFilter,
        select: {
          id: true,
          title: true,
          locationLat: true,
          locationLon: true,
          reportedAt: true,
        },
      }),
      // Patrol List breakdown
      prisma.patrol.findMany({
        where: patrolFilter,
        take: 300,
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          title: true,
          serialNumber: true,
          patrolType: true,
          startTime: true,
          endTime: true,
          totalDistanceKm: true,
          computedDistanceKm: true,
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
        orderBy: { until: "desc" },
        select: {
          trackGeojson: true,
          patrol: { select: { id: true, title: true, serialNumber: true } },
        },
      }),
    ]),
  ] as const);

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
      startTime: p.startTime,
      endTime: p.endTime,
      // Prefer haversine-recomputed distance (v2) over ER-supplied total
      distanceKm: p.computedDistanceKm ?? p.totalDistanceKm,
      leaderName: leaders[0] ?? null,
    };
  });

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
  };

  // ─── Events Over Time chart ───────────────────────────────────────────────
  const overviewPoints: ReportMapEventPoint[] = [];
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
    charts: {
      lawEnforcement,
      monitoring,
      highPriority,
      patrolList,
      eventsOverTime,
    },
  };
}
