/**
 * Server-side data loader for the Per Area Report PDF render target.
 *
 * Consumed by /print-render/[tenantSlug]/[reportType]/[exportId]/page.tsx when
 * reportType === "per-area". Returns a shaped payload containing the tenant,
 * the selected AreaBoundary, the resolved date range, dynamic event-type
 * breakdowns (law enforcement + monitoring categories), and patrol summary
 * counts split by foot vs seaborne.
 *
 * Spec: docs/PRODUCT.md §130-139 "Reports — Per Area".
 *
 * Returns null when:
 *   - the tenant slug does not exist
 *   - the export id does not exist
 *   - the export belongs to a different tenant
 *   - the export's reportType is not "per-area"
 *   - the params do not resolve a valid AreaBoundary on this tenant
 *
 * The page renderer is responsible for handling null → 404.
 *
 * Date range resolution: explicit startDate + endDate in paramsJson when
 * present; otherwise the current calendar month in the tenant's local zone
 * (per spec L132: "Date range picker (default: current month)"). End date is
 * stored as the exclusive day-after — UI surfaces an inclusive label.
 *
 * Event category matching: EventType.category is a free-form string that
 * mirrors EarthRanger's hierarchy. The spec calls out two top-level buckets
 * — "law enforcement" and "monitoring" — and says the breakdown must be
 * dynamically populated from synced event types (not hardcoded). Matching is
 * case-insensitive substring against the EventType.category field. Event
 * types whose category matches neither bucket are excluded from both
 * breakdowns (e.g. operational categories like "test" or "system"); they
 * still appear in raw Event records, just not in this report's charts.
 *
 * Out of scope for 6.2a (lands in 6.2b/6.2c/6.2d):
 *   - Event location heatmap data (Page 2 — 6.2b)
 *   - Patrol track heatmap data (Page 2 — 6.2b)
 *   - Fuel consumption aggregation (Page 3 — 6.2c)
 *   - ReportExport row creation flow + reportType: "per-area" wiring (6.2d)
 */

import { prisma } from "@marine-guardian/db";
import type { PatrolType } from "@marine-guardian/shared/types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "@marine-guardian/shared/lib/coverage-period";

/**
 * One row in the dynamic event-type bar charts. Sorted DESC by count, then
 * ASC by display label for stable ties.
 */
export interface EventTypeBreakdownRow {
  eventTypeId: string;
  value: string;
  display: string;
  count: number;
}

/**
 * Per-PatrolType aggregate. Null km/hours on individual patrols contribute 0
 * to the totals (preserves the schema's "we did not measure" semantic).
 */
export interface PatrolTypeSummary {
  count: number;
  totalDistanceKm: number;
  totalHours: number;
}

export interface PerAreaReportArea {
  id: string;
  name: string;
  region: string;
  source: string;
}

export interface PerAreaReportDateRange {
  /** Inclusive UTC start. */
  start: Date;
  /** Exclusive UTC end (day-after the inclusive last day). */
  end: Date;
  /** Tenant-local display label, e.g. "May 2026" or "2026-05-01 — 2026-05-31". */
  label: string;
  /** True when params were missing — fell back to the current calendar month. */
  isDefault: boolean;
}

export interface PerAreaReportData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  area: PerAreaReportArea;
  dateRange: PerAreaReportDateRange;
  paperSize: "A4" | "Letter" | "Legal";
  generatedAt: Date;
  /**
   * Event types whose category matches "law enforcement" (case-insensitive
   * substring). Always sorted by count DESC then display ASC. Empty array
   * when no matching events fired in the range.
   */
  lawEnforcementBreakdown: EventTypeBreakdownRow[];
  /**
   * Same shape, filtered to "monitoring" category. Spec L134.
   */
  monitoringBreakdown: EventTypeBreakdownRow[];
  /**
   * Patrol counts and totals split by PatrolType. Spec L136.
   */
  patrolSummary: {
    foot: PatrolTypeSummary;
    seaborne: PatrolTypeSummary;
  };
}

interface ParsedPerAreaParams {
  areaBoundaryId?: string;
  /** Explicit start (ISO date string) — used verbatim when valid. */
  startDate?: Date;
  /** Explicit end (ISO date string, exclusive). */
  endDate?: Date;
}

const LAW_ENFORCEMENT_NEEDLE = "law enforcement";
const MONITORING_NEEDLE = "monitoring";

export function parsePerAreaParams(paramsJson: unknown): ParsedPerAreaParams {
  if (typeof paramsJson !== "object" || paramsJson === null) return {};
  const p = paramsJson as Record<string, unknown>;
  const out: ParsedPerAreaParams = {};
  if (typeof p.areaBoundaryId === "string" && p.areaBoundaryId.length > 0) {
    out.areaBoundaryId = p.areaBoundaryId;
  }
  if (typeof p.startDate === "string") {
    const d = new Date(p.startDate);
    if (!Number.isNaN(d.getTime())) out.startDate = d;
  }
  if (typeof p.endDate === "string") {
    const d = new Date(p.endDate);
    if (!Number.isNaN(d.getTime())) out.endDate = d;
  }
  return out;
}

function resolveTenantOffsetMinutes(timezone: string): number {
  if (timezone === "UTC") return 0;
  // v2 launch tenants are all UTC+8. Proper IANA→offset resolution is
  // deferred until the first DST-observing tenant onboards (see
  // get-coverage-report-data.ts JSDoc).
  return DEFAULT_TENANT_OFFSET_MINUTES;
}

/**
 * Returns the tenant-local current-calendar-month range as { startUtc, endUtc }.
 * Used when the export params do not pin an explicit date window.
 */
export function resolveDefaultMonthRange(
  now: Date,
  offsetMinutes: number,
): { start: Date; end: Date; label: string } {
  const localNow = new Date(now.getTime() + offsetMinutes * 60_000);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  // Tenant-local first instant of this month, converted back to UTC.
  const startLocalUtc = Date.UTC(year, month, 1, 0, 0, 0);
  const start = new Date(startLocalUtc - offsetMinutes * 60_000);
  const endLocalUtc = Date.UTC(year, month + 1, 1, 0, 0, 0);
  const end = new Date(endLocalUtc - offsetMinutes * 60_000);
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const label = `${monthNames[month] ?? "Month"} ${String(year)}`;
  return { start, end, label };
}

/**
 * Formats a Date's UTC calendar parts as YYYY-MM-DD. Used for the
 * explicit-range label only — the export creator submits start/end as
 * calendar dates (UI date pickers ship date-at-UTC-midnight ISO strings),
 * so the label should display those calendar parts verbatim regardless of
 * the tenant timezone. The actual query scopes use the raw UTC instants.
 */
function formatRangeDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${String(y)}-${m}-${dd}`;
}

function categoryMatches(
  category: string | null | undefined,
  needle: string,
): boolean {
  if (typeof category !== "string") return false;
  return category.toLowerCase().includes(needle);
}

interface BreakdownAccumulator {
  eventTypeId: string;
  value: string;
  display: string;
  count: number;
}

function buildBreakdown(
  raw: ReadonlyArray<{
    eventTypeId: string;
    eventType: { id: string; value: string; display: string; category: string | null } | null;
  }>,
  needle: string,
): EventTypeBreakdownRow[] {
  const byId = new Map<string, BreakdownAccumulator>();
  for (const evt of raw) {
    if (evt.eventType === null) continue;
    if (!categoryMatches(evt.eventType.category, needle)) continue;
    const existing = byId.get(evt.eventType.id);
    if (existing === undefined) {
      byId.set(evt.eventType.id, {
        eventTypeId: evt.eventType.id,
        value: evt.eventType.value,
        display: evt.eventType.display,
        count: 1,
      });
    } else {
      existing.count += 1;
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.display.localeCompare(b.display);
  });
}

function buildPatrolSummary(
  patrols: ReadonlyArray<{
    patrolType: PatrolType;
    totalDistanceKm: number | null;
    totalHours: number | null;
  }>,
): PerAreaReportData["patrolSummary"] {
  const init = (): PatrolTypeSummary => ({
    count: 0,
    totalDistanceKm: 0,
    totalHours: 0,
  });
  const foot = init();
  const seaborne = init();
  for (const p of patrols) {
    const bucket = p.patrolType === "foot" ? foot : seaborne;
    bucket.count += 1;
    if (p.totalDistanceKm !== null && Number.isFinite(p.totalDistanceKm)) {
      bucket.totalDistanceKm += p.totalDistanceKm;
    }
    if (p.totalHours !== null && Number.isFinite(p.totalHours)) {
      bucket.totalHours += p.totalHours;
    }
  }
  return { foot, seaborne };
}

export async function getPerAreaReportData(
  tenantSlug: string,
  exportId: string,
): Promise<PerAreaReportData | null> {
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
  if (reportExport.reportType !== "area") return null;

  const params = parsePerAreaParams(reportExport.paramsJson);

  // Area resolution. When areaBoundaryId is unset, fall back to the first
  // enabled boundary alphabetically — gives the report something to render
  // when an exporter creates a row with bare-minimum params. When set but
  // not found (or belongs to another tenant), bail with null.
  let area: PerAreaReportArea | null = null;
  if (params.areaBoundaryId !== undefined) {
    const row = await prisma.areaBoundary.findUnique({
      where: { id: params.areaBoundaryId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        region: true,
        source: true,
        isEnabled: true,
      },
    });
    if (row === null) return null;
    if (row.tenantId !== tenant.id) return null;
    area = {
      id: row.id,
      name: row.name,
      region: row.region,
      source: row.source,
    };
  } else {
    const fallback = await prisma.areaBoundary.findFirst({
      where: { tenantId: tenant.id, isEnabled: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, region: true, source: true },
    });
    if (fallback === null) return null;
    area = fallback;
  }

  const offsetMinutes = resolveTenantOffsetMinutes(tenant.timezone);
  let dateRange: PerAreaReportDateRange;
  if (params.startDate !== undefined && params.endDate !== undefined) {
    dateRange = {
      start: params.startDate,
      end: params.endDate,
      label: `${formatRangeDate(params.startDate)} — ${formatRangeDate(
        new Date(params.endDate.getTime() - 1),
      )}`,
      isDefault: false,
    };
  } else {
    const def = resolveDefaultMonthRange(reportExport.createdAt, offsetMinutes);
    dateRange = { ...def, isDefault: true };
  }

  const events = await prisma.event.findMany({
    where: {
      tenantId: tenant.id,
      areaBoundaryId: area.id,
      reportedAt: { gte: dateRange.start, lt: dateRange.end },
      eventTypeId: { not: null },
    },
    select: {
      eventTypeId: true,
      eventType: {
        select: { id: true, value: true, display: true, category: true },
      },
    },
  });
  // Prisma's where: { not: null } guarantees eventTypeId is a string here.
  // Cast at the boundary to keep the helper signatures clean.
  const eventsTyped = events as ReadonlyArray<{
    eventTypeId: string;
    eventType: {
      id: string;
      value: string;
      display: string;
      category: string | null;
    } | null;
  }>;

  const lawEnforcementBreakdown = buildBreakdown(
    eventsTyped,
    LAW_ENFORCEMENT_NEEDLE,
  );
  const monitoringBreakdown = buildBreakdown(eventsTyped, MONITORING_NEEDLE);

  const patrols = await prisma.patrol.findMany({
    where: {
      tenantId: tenant.id,
      areaBoundaryId: area.id,
      startTime: { gte: dateRange.start, lt: dateRange.end },
    },
    select: {
      patrolType: true,
      totalDistanceKm: true,
      totalHours: true,
    },
  });

  const patrolSummary = buildPatrolSummary(patrols);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
    },
    area,
    dateRange,
    paperSize: reportExport.paperSize,
    generatedAt: new Date(),
    lawEnforcementBreakdown,
    monitoringBreakdown,
    patrolSummary,
  };
}
