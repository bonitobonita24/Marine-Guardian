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
    const endpoints = extractTrackEndpoints(p.track?.trackGeojson);
    return {
      id: p.id,
      serialNumber: p.serialNumber,
      title: p.title,
      patrolType: p.patrolType,
      state: p.state,
      startTime: p.startTime,
      endTime: p.endTime,
      totalDistanceKm: p.totalDistanceKm,
      totalHours: p.totalHours,
      boatName: p.boatName,
      leaderName,
      areaName: p.areaName,
      startLocation: endpoints.start,
      endLocation: endpoints.end,
    };
  });

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
  };
}
