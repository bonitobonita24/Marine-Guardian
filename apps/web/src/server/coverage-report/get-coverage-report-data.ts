/**
 * Server-side data loader for the Coverage Report PDF render target.
 *
 * Consumed by /print-render/[tenantSlug]/[reportType]/[exportId]/page.tsx when
 * reportType === "coverage". Returns a shaped payload containing the tenant,
 * the resolved Period (per v2 PRODUCT.md L210-L218), the list of patrols that
 * started within the period (with first-segment leader name + track endpoint
 * coordinates), and rendering metadata.
 *
 * Returns null when:
 *   - the tenant slug does not exist
 *   - the export id does not exist
 *   - the export belongs to a different tenant
 *   - the export's reportType is not "coverage"
 *
 * The page renderer is responsible for handling null → 404.
 *
 * Tenant timezone: derived from Tenant.timezone (string). v2 launch tenants
 * (Mindoro, Banggai) are both UTC+8. The DST audit is deferred per
 * PRODUCT.md L626 — for now non-UTC timezones fall through to the default
 * UTC+8 offset (DEFAULT_TENANT_OFFSET_MINUTES). A proper IANA offset
 * resolver is future work (see lib/coverage-period/types.ts JSDoc).
 *
 * Test patrol exclusion (spec L214): no isTest column exists on Patrol in
 * the current schema. Filter is a no-op in 6.1a; lands when the schema
 * column is added.
 */

import { prisma } from "@marine-guardian/db";
import type { PatrolType } from "@marine-guardian/shared/types";
import {
  attributePatrolToArea,
  countPatrolsByArea,
  type AreaBoundaryForDerivation,
  type AreaPatrolCount,
  type AttributionSource,
} from "@marine-guardian/shared/lib/area-attribution";
import {
  accumulateCoverageByBoundary,
  type BoundaryCoverage,
} from "@marine-guardian/shared/lib/coverage-clip";
import {
  DEFAULT_TENANT_OFFSET_MINUTES,
  getSelectedTemplatePeriod,
  type Period,
  type PeriodCategory,
  type SelectedTemplatePeriodInput,
} from "@marine-guardian/shared/lib/coverage-period";

export interface CoverageReportPatrolRow {
  id: string;
  serialNumber: string | null;
  title: string | null;
  patrolType: PatrolType;
  state: string;
  startTime: Date | null;
  endTime: Date | null;
  totalDistanceKm: number | null;
  totalHours: number | null;
  boatName: string | null;
  leaderName: string | null;
  areaName: string | null;
  startLocation: { lat: number; lon: number } | null;
  endLocation: { lat: number; lon: number } | null;
  /** Polyline coordinates [lon, lat] (or null when no track). Used by Page 2 map overlay. */
  trackLineString: Array<[number, number]> | null;
}

/**
 * Enabled AreaBoundary projected into the shape Page 2 of the Coverage
 * Report needs. The render layer also draws each polygon on the map, so
 * we ship the geometry alongside the attribution fields.
 */
export interface CoverageReportArea {
  id: string;
  name: string;
  region: string;
  source: string;
  geometryType: "Polygon" | "LineString";
  /** Raw GeoJSON for the boundary — Leaflet renders this verbatim. */
  geometryGeojson: Record<string, unknown>;
  /** Optional ArcGIS dashed reference outline id — null when no reference exists. */
  arcgisReferenceId: string | null;
}

export interface CoverageReportAttribution {
  patrolId: string;
  areaBoundaryId: string | null;
  matchedVia: AttributionSource;
}

export interface CoverageReportData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  period: Period;
  paperSize: "A4" | "Letter" | "Legal";
  excludeTestPatrols: boolean;
  generatedAt: Date;
  patrols: CoverageReportPatrolRow[];
  /** Enabled AreaBoundary roster — empty array when the tenant has none. */
  enabledAreas: CoverageReportArea[];
  /** One row per patrol — same length and order as `patrols`. */
  attributions: CoverageReportAttribution[];
  /** Per-boundary tally + a separate count for patrols outside all enabled boundaries. */
  patrolCountsByArea: AreaPatrolCount[];
  unattributedPatrolCount: number;
  /**
   * Page 3 — Area Covered. One row per Polygon AreaBoundary with coverage
   * km/hrs accumulated by clipping each patrol's track against the boundary.
   * Sorted by coverageKm DESC then areaName ASC. LineString boundaries are
   * excluded (clipping is meaningless on coastline references).
   */
  areaCoverage: BoundaryCoverage[];
  /**
   * Patrols with totalHours > 0 but no trackLineString — surfaced in the
   * Page 3 footer note so coverage readers know the coverage_km may
   * understate reality.
   */
  missingTracksCount: number;
}

interface ParsedCoverageParams extends SelectedTemplatePeriodInput {
  excludeTestPatrols?: boolean;
}

const PERIOD_CATEGORIES: ReadonlySet<PeriodCategory> = new Set([
  "weekly",
  "monthly",
  "annual",
]);

export function parseCoverageParams(paramsJson: unknown): ParsedCoverageParams {
  if (typeof paramsJson !== "object" || paramsJson === null) return {};
  const p = paramsJson as Record<string, unknown>;
  const out: ParsedCoverageParams = {};
  if (
    typeof p.category === "string" &&
    PERIOD_CATEGORIES.has(p.category as PeriodCategory)
  ) {
    out.category = p.category as PeriodCategory;
  }
  if (typeof p.year === "number" && Number.isInteger(p.year)) {
    out.year = p.year;
  }
  if (typeof p.month === "number" && Number.isInteger(p.month)) {
    out.month = p.month;
  }
  if (typeof p.weekIndex === "number" && Number.isInteger(p.weekIndex)) {
    out.weekIndex = p.weekIndex;
  }
  if (typeof p.excludeTestPatrols === "boolean") {
    out.excludeTestPatrols = p.excludeTestPatrols;
  }
  return out;
}

function parseCoord(c: unknown): { lat: number; lon: number } | null {
  if (!Array.isArray(c) || c.length < 2) return null;
  const arr = c as unknown[];
  const lon = arr[0];
  const lat = arr[1];
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lat, lon };
}

/**
 * Extracts the full polyline as [lon, lat] pairs from a GeoJSON
 * LineString or MultiLineString (flattened head-to-tail). Returns null
 * when the shape is missing, malformed, or contains fewer than 2 points.
 *
 * Page 2 of the Coverage Report (6.1b) renders the polyline as a
 * Leaflet polyline overlay on the area-coverage map.
 */
export function extractTrackPolyline(
  geojson: unknown,
): Array<[number, number]> | null {
  if (typeof geojson !== "object" || geojson === null) return null;
  const g = geojson as Record<string, unknown>;
  const coords = g.coordinates;

  function asPair(c: unknown): [number, number] | null {
    if (!Array.isArray(c) || c.length < 2) return null;
    const arr = c as unknown[];
    const lon = arr[0];
    const lat = arr[1];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return [lon, lat];
  }

  if (g.type === "LineString" && Array.isArray(coords)) {
    const out: Array<[number, number]> = [];
    for (const c of coords as unknown[]) {
      const pair = asPair(c);
      if (pair !== null) out.push(pair);
    }
    return out.length >= 2 ? out : null;
  }

  if (g.type === "MultiLineString" && Array.isArray(coords)) {
    const out: Array<[number, number]> = [];
    for (const line of coords as unknown[]) {
      if (!Array.isArray(line)) continue;
      for (const c of line as unknown[]) {
        const pair = asPair(c);
        if (pair !== null) out.push(pair);
      }
    }
    return out.length >= 2 ? out : null;
  }

  return null;
}

/**
 * Extracts first and last coordinate from a GeoJSON LineString or
 * MultiLineString track. Returns { start: null, end: null } when the
 * shape is missing, malformed, or empty.
 */
export function extractTrackEndpoints(geojson: unknown): {
  start: { lat: number; lon: number } | null;
  end: { lat: number; lon: number } | null;
} {
  if (typeof geojson !== "object" || geojson === null) {
    return { start: null, end: null };
  }
  const g = geojson as Record<string, unknown>;
  const coords = g.coordinates;
  if (g.type === "LineString" && Array.isArray(coords) && coords.length > 0) {
    const lineCoords = coords as unknown[];
    return {
      start: parseCoord(lineCoords[0]),
      end: parseCoord(lineCoords[lineCoords.length - 1]),
    };
  }
  if (
    g.type === "MultiLineString" &&
    Array.isArray(coords) &&
    coords.length > 0
  ) {
    const lines = coords as unknown[];
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    if (
      Array.isArray(firstLine) &&
      firstLine.length > 0 &&
      Array.isArray(lastLine) &&
      lastLine.length > 0
    ) {
      const first = firstLine as unknown[];
      const last = lastLine as unknown[];
      return {
        start: parseCoord(first[0]),
        end: parseCoord(last[last.length - 1]),
      };
    }
  }
  return { start: null, end: null };
}

function resolveTenantOffsetMinutes(timezone: string): number {
  if (timezone === "UTC") return 0;
  // v2 launch tenants are all UTC+8. Proper IANA→offset resolution is
  // deferred until the first DST-observing tenant onboards.
  return DEFAULT_TENANT_OFFSET_MINUTES;
}

export async function getCoverageReportData(
  tenantSlug: string,
  exportId: string,
): Promise<CoverageReportData | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, timezone: true },
  });
  if (tenant === null) return null;

  const reportExport = await prisma.reportExport.findUnique({
    where: { id: exportId },
    select: {
      tenantId: true,
      reportType: true,
      paramsJson: true,
      paperSize: true,
      createdAt: true,
    },
  });
  if (reportExport === null) return null;
  if (reportExport.tenantId !== tenant.id) return null;
  if (reportExport.reportType !== "coverage") return null;

  const params = parseCoverageParams(reportExport.paramsJson);
  const offsetMinutes = resolveTenantOffsetMinutes(tenant.timezone);
  const period = getSelectedTemplatePeriod(
    params,
    reportExport.createdAt,
    offsetMinutes,
  );

  const patrolsRaw = await prisma.patrol.findMany({
    where: {
      tenantId: tenant.id,
      startTime: { gte: period.start, lt: period.end },
    },
    orderBy: { startTime: "asc" },
    include: {
      segments: {
        orderBy: { actualStart: "asc" },
        take: 1,
        select: { leaderName: true },
      },
      track: { select: { trackGeojson: true } },
    },
  });

  const patrols: CoverageReportPatrolRow[] = patrolsRaw.map((p) => {
    const leaderName = p.segments[0]?.leaderName ?? null;
    const trackGeojson = p.track?.trackGeojson;
    const endpoints = extractTrackEndpoints(trackGeojson);
    const polyline = extractTrackPolyline(trackGeojson);
    return {
      id: p.id,
      serialNumber: p.serialNumber,
      title: p.title,
      patrolType: p.patrolType,
      state: p.state,
      startTime: p.startTime,
      endTime: p.endTime,
      totalDistanceKm: p.computedDistanceKm ?? p.totalDistanceKm,
      totalHours: p.totalHours,
      boatName: p.boatName,
      leaderName,
      areaName: p.areaName,
      startLocation: endpoints.start,
      endLocation: endpoints.end,
      trackLineString: polyline,
    };
  });

  // Page 2 — Area Boundary Summary.
  //
  // Pull the tenant's enabled AreaBoundary roster. Then attribute each
  // patrol to a boundary via nearestStartArea → featureMatchesArea per
  // v2 PRODUCT.md L771. Empty boundaries roster is a valid state — Page 2
  // gracefully renders an "Outside enabled boundaries" tally only.
  const enabledBoundariesRaw = await prisma.areaBoundary.findMany({
    where: { tenantId: tenant.id, isEnabled: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      aliases: true,
      region: true,
      source: true,
      geometryType: true,
      geometryGeojson: true,
      arcgisReferenceId: true,
    },
  });

  const enabledAreas: CoverageReportArea[] = enabledBoundariesRaw.map((b) => ({
    id: b.id,
    name: b.name,
    region: b.region,
    source: b.source,
    geometryType: b.geometryType,
    geometryGeojson: b.geometryGeojson as Record<string, unknown>,
    arcgisReferenceId: b.arcgisReferenceId,
  }));

  const boundariesForAttribution: AreaBoundaryForDerivation[] =
    enabledBoundariesRaw.map((b) => ({
      id: b.id,
      name: b.name,
      aliases: b.aliases,
      isEnabled: true,
      geometryType: b.geometryType,
      geometryGeojson: b.geometryGeojson as Record<string, unknown>,
    }));

  const attributions: CoverageReportAttribution[] = patrols.map((p) => {
    const result = attributePatrolToArea(
      {
        id: p.id,
        startLocation: p.startLocation,
        areaName: p.areaName,
      },
      boundariesForAttribution,
    );
    return {
      patrolId: result.patrolId,
      areaBoundaryId: result.areaBoundaryId,
      matchedVia: result.matchedVia,
    };
  });

  const { rows: patrolCountsByArea, unattributedCount } = countPatrolsByArea(
    attributions,
    boundariesForAttribution,
  );

  // Page 3 — Area Covered.
  //
  // Clip each patrol's polyline against every enabled Polygon boundary to
  // get coverage_km, then pro-rate totalHours by the km fraction inside
  // each boundary. LineString boundaries are skipped by the aggregator —
  // they appear on Page 2 as dashed reference outlines only.
  //
  // Reuses boundariesForAttribution: AreaBoundaryForDerivation is the
  // single-sourced boundary shape across area-derivation, area-attribution,
  // and coverage-clip (see packages/shared/src/lib/coverage-clip/types.ts).
  const { rows: areaCoverage, missingTracksCount } = accumulateCoverageByBoundary(
    patrols.map((p) => ({
      id: p.id,
      trackLineString: p.trackLineString,
      totalHours: p.totalHours,
    })),
    boundariesForAttribution,
  );

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
    },
    period,
    paperSize: reportExport.paperSize,
    excludeTestPatrols: params.excludeTestPatrols ?? true,
    generatedAt: new Date(),
    patrols,
    enabledAreas,
    attributions,
    patrolCountsByArea,
    unattributedPatrolCount: unattributedCount,
    areaCoverage,
    missingTracksCount,
  };
}
