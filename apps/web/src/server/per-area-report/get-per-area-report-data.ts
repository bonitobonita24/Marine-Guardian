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
 * 6.2b-i additions:
 *   - lawEnforcementEventLocations[] + monitoringEventLocations[]: filtered
 *     Event point geometries used by the Page 2 event-location heatmap.
 *     Bucketing reuses the same case-insensitive substring match on
 *     EventType.category as the breakdown helpers (single co-pass).
 *   - patrolTracks[]: per-patrol [lat, lon, weight] tuples ready for direct
 *     consumption by L.heatLayer. Tracks are densified via the shared
 *     heatmap-sample library at 250m intervals (locked in DECISIONS_LOG.md
 *     "Heatmap Renderer Choice"). Patrols with no materialised track or
 *     non-LineString geometry are skipped defensively.
 *
 * 6.2c additions (this sub-batch — Page 3 fuel consumption):
 *   - fuelConsumption: KPIs (total liters, total cost, average L/km) +
 *     per-month breakdown table data. FuelEntry is keyed by
 *     (tenantId, areaBoundaryId, dateReceived) — NOT joined to Patrol.
 *     Fuel is allocated at area level per PRODUCT.md §128 ("Fuel is shared
 *     across all boats in an area — not tracked per individual boat"), so
 *     L/km is always an aggregate ratio over an area + period window.
 *     totalSeabornePatrolKm reuses patrolSummary.seaborne.totalDistanceKm
 *     already aggregated by buildPatrolSummary.
 *     averageLitersPerKm is null when totalSeabornePatrolKm === 0
 *     (divide-by-zero guard — the page renders "N/A" in that case).
 *     Returns null only when BOTH the fuel entry list AND the seaborne
 *     distance total are empty — there's nothing to show on Page 3.
 *
 * Out of scope for 6.2c (lands in 6.2d):
 *   - ReportExport row creation flow + reportType: "area" wiring (6.2d)
 */

import { prisma } from "@marine-guardian/db";
import type { PatrolType } from "@marine-guardian/shared/types";
import { DEFAULT_TENANT_OFFSET_MINUTES } from "@marine-guardian/shared/lib/coverage-period";
import {
  sampleTrackPoints,
  type HeatLatLng,
} from "@marine-guardian/shared/lib/heatmap-sample";
import { extractTrackPolyline } from "@/server/coverage-report/get-coverage-report-data";

/**
 * Patrol-track densification interval in meters. Locked at 250m per the
 * "Heatmap Renderer Choice" decision — balances visual coverage against
 * client-island payload size for typical patrol tracks (1-30 km).
 */
const TRACK_SAMPLE_INTERVAL_METERS = 250;

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

/**
 * One event geometry contributed to a heatmap layer. Lat/lon are the raw
 * Event.locationLat/locationLon scalars (no densification — events are
 * native point geometries). Skipped entirely when either coordinate is
 * null or non-finite. eventTypeId is included for client-side filtering
 * or per-type drill-down (not currently consumed by 6.2b but cheap to
 * include).
 */
export interface PerAreaReportEventLocation {
  lat: number;
  lon: number;
  eventTypeId: string;
}

/**
 * One patrol's track densified into [lat, lon, weight] tuples ready for
 * direct L.heatLayer consumption (Leaflet HeatLatLng convention).
 *
 * Sampling uses haversine arc-length stepping at TRACK_SAMPLE_INTERVAL_METERS
 * (250m default). Patrols with no PatrolTrack row, with a non-LineString
 * track geometry, or whose track materialises to <2 points are filtered
 * out by the loader before this shape is built.
 */
export interface PerAreaReportPatrolTrack {
  patrolId: string;
  patrolType: PatrolType;
  /** Pre-densified [lat, lon, weight] tuples — ready for L.heatLayer.addTo(map). */
  sampledPoints: HeatLatLng[];
}

/**
 * One row in the per-month fuel breakdown table. Renders only when the
 * report's dateRange spans ≥2 calendar months (otherwise the KPI cards
 * alone tell the whole story). month is the YYYY-MM tenant-local calendar
 * label. litersPerKm is null when seabornePatrolKm === 0 in that month.
 */
export interface PerAreaReportFuelMonthRow {
  /** YYYY-MM calendar label (tenant-local). */
  month: string;
  liters: number;
  cost: number;
  seabornePatrolKm: number;
  litersPerKm: number | null;
}

/**
 * Aggregated fuel consumption for Page 3. Null only when there are no fuel
 * entries AND no seaborne patrol distance recorded in the period — Page 3
 * renders an empty state in that case.
 */
export interface PerAreaReportFuelConsumption {
  totalLiters: number;
  totalCost: number;
  /** ISO 4217 code from the first fuel entry, or "PHP" fallback. */
  currency: string;
  totalSeabornePatrolKm: number;
  /** Null when totalSeabornePatrolKm === 0 (divide-by-zero guard). */
  averageLitersPerKm: number | null;
  entryCount: number;
  /** Sorted chronologically (YYYY-MM ASC). Empty when no fuel entries. */
  perMonthBreakdown: PerAreaReportFuelMonthRow[];
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
  /**
   * Point geometries for the Page 2 event-location heatmap, filtered to
   * events whose EventType.category matches "law enforcement"
   * (case-insensitive substring). Spec PRODUCT.md L135. Empty array when
   * no matching events have a non-null location in the range.
   */
  lawEnforcementEventLocations: PerAreaReportEventLocation[];
  /**
   * Same shape as lawEnforcementEventLocations, filtered to events whose
   * EventType.category matches "monitoring" (case-insensitive substring).
   */
  monitoringEventLocations: PerAreaReportEventLocation[];
  /**
   * Per-patrol densified track points for the Page 2 patrol-track heatmap.
   * Each row carries pre-densified [lat, lon, weight] tuples ready for
   * direct L.heatLayer consumption — the Client island never re-runs the
   * sampler. Spec PRODUCT.md L137.
   */
  patrolTracks: PerAreaReportPatrolTrack[];
  /**
   * Page 3 fuel consumption data. Null when no fuel entries AND no seaborne
   * patrol distance exists in the period — Page 3 renders an empty state in
   * that case. Spec PRODUCT.md §138.
   */
  fuelConsumption: PerAreaReportFuelConsumption | null;
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

/**
 * Filters and projects events into PerAreaReportEventLocation rows for a
 * single category bucket. Reuses the same categoryMatches predicate as
 * buildBreakdown so the heatmap layer and the bar chart are guaranteed to
 * include the same event population. Events with null/non-finite location
 * coordinates are skipped — Event.locationLat/locationLon are optional
 * scalars on the schema (ER can publish events without GPS context).
 */
function buildEventLocations(
  raw: ReadonlyArray<{
    eventTypeId: string;
    locationLat: number | null;
    locationLon: number | null;
    eventType: {
      id: string;
      value: string;
      display: string;
      category: string | null;
    } | null;
  }>,
  needle: string,
): PerAreaReportEventLocation[] {
  const out: PerAreaReportEventLocation[] = [];
  for (const evt of raw) {
    if (evt.eventType === null) continue;
    if (!categoryMatches(evt.eventType.category, needle)) continue;
    if (evt.locationLat === null || evt.locationLon === null) continue;
    if (
      !Number.isFinite(evt.locationLat) ||
      !Number.isFinite(evt.locationLon)
    ) {
      continue;
    }
    out.push({
      lat: evt.locationLat,
      lon: evt.locationLon,
      eventTypeId: evt.eventType.id,
    });
  }
  return out;
}

/**
 * Densifies each patrol's track LineString into [lat, lon, weight] tuples
 * via the shared heatmap-sample library. Patrols with no PatrolTrack row,
 * with a non-LineString geometry, or whose extracted polyline has <2
 * points are skipped — they contribute nothing to the heatmap.
 */
function buildPatrolTracks(
  raw: ReadonlyArray<{
    id: string;
    patrolType: PatrolType;
    track: { trackGeojson: unknown } | null;
  }>,
): PerAreaReportPatrolTrack[] {
  const out: PerAreaReportPatrolTrack[] = [];
  for (const p of raw) {
    if (p.track === null) continue;
    const polyline = extractTrackPolyline(p.track.trackGeojson);
    if (polyline === null) continue;
    const sampledPoints = sampleTrackPoints(polyline, {
      intervalMeters: TRACK_SAMPLE_INTERVAL_METERS,
    });
    if (sampledPoints.length === 0) continue;
    out.push({
      patrolId: p.id,
      patrolType: p.patrolType,
      sampledPoints,
    });
  }
  return out;
}

/**
 * One fuel entry row as the buildFuelConsumption helper sees it. liters and
 * totalPrice arrive from Prisma as Decimal — narrowed here to `unknown` and
 * decoded via the toFiniteNumber helper to keep the helper independent of
 * the Prisma Decimal class (and trivially mockable from tests that pass
 * plain numbers).
 */
interface RawFuelEntry {
  liters: unknown;
  totalPrice: unknown;
  currency: string;
  dateReceived: Date;
}

/**
 * Bucketing input — one seaborne patrol's startedAt + distance. Reused
 * across the per-month bucketing pass so each month row carries both
 * fuel-bucketed liters AND patrol-bucketed seaborne km.
 *
 * startedAt is nullable to match Patrol.startTime on the schema (Prisma
 * `DateTime?`). When null, the patrol still contributes to the aggregate
 * total km but is skipped from the per-month bucketing — see
 * buildFuelConsumption for the defensive guard.
 */
interface SeabornePatrolBucketInput {
  startedAt: Date | null;
  totalDistanceKm: number | null;
}

/**
 * Coerces Prisma's Decimal | number | string into a finite number. Returns
 * null when the value is missing or non-finite (e.g. unparseable string,
 * NaN). Avoids depending on Prisma.Decimal directly so tests can mock with
 * plain numbers.
 */
function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v !== null && typeof v === "object" && "toNumber" in v) {
    const fn = (v as { toNumber: () => number }).toNumber;
    if (typeof fn === "function") {
      const n = fn.call(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Returns a YYYY-MM tenant-local month label for a Date instant. The fuel
 * entry uses `@db.Date` so dateReceived is already a midnight-UTC calendar
 * date — shifting by the offset gives the tenant-local calendar month. For
 * patrols we shift the patrol startedAt instant the same way.
 */
function tenantLocalMonthLabel(d: Date, offsetMinutes: number): string {
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${String(y)}-${m}`;
}

interface FuelMonthBucket {
  liters: number;
  cost: number;
  seabornePatrolKm: number;
}

/**
 * Aggregates fuel entries + seaborne patrol distances into a Page 3 payload.
 * Returns null when both inputs are empty (the page renders an empty state).
 *
 * Bucketing rule: fuel entries bucket by `dateReceived` YYYY-MM. Seaborne
 * patrol km bucket by `startedAt` YYYY-MM. The two streams meet at the
 * month label — months that have fuel but no patrol km show litersPerKm
 * null; months that have patrol km but no fuel show liters/cost zero.
 *
 * Currency: pulled from the first fuel entry. Empty fuel list → "PHP"
 * fallback (v2 launch tenants are all PHP-denominated per DECISIONS_LOG).
 */
function buildFuelConsumption(
  fuelEntries: ReadonlyArray<RawFuelEntry>,
  seabornePatrols: ReadonlyArray<SeabornePatrolBucketInput>,
  offsetMinutes: number,
): PerAreaReportFuelConsumption | null {
  if (fuelEntries.length === 0 && seabornePatrols.length === 0) return null;

  let totalLiters = 0;
  let totalCost = 0;
  let entryCount = 0;
  const buckets = new Map<string, FuelMonthBucket>();
  const ensureBucket = (month: string): FuelMonthBucket => {
    let b = buckets.get(month);
    if (b === undefined) {
      b = { liters: 0, cost: 0, seabornePatrolKm: 0 };
      buckets.set(month, b);
    }
    return b;
  };

  for (const e of fuelEntries) {
    const litersNum = toFiniteNumber(e.liters);
    const costNum = toFiniteNumber(e.totalPrice);
    if (litersNum === null && costNum === null) continue;
    if (
      !(e.dateReceived instanceof Date) ||
      Number.isNaN(e.dateReceived.getTime())
    ) {
      continue;
    }
    const liters = litersNum ?? 0;
    const cost = costNum ?? 0;
    totalLiters += liters;
    totalCost += cost;
    entryCount += 1;
    const month = tenantLocalMonthLabel(e.dateReceived, offsetMinutes);
    const bucket = ensureBucket(month);
    bucket.liters += liters;
    bucket.cost += cost;
  }

  let totalSeabornePatrolKm = 0;
  for (const p of seabornePatrols) {
    if (p.totalDistanceKm === null || !Number.isFinite(p.totalDistanceKm)) {
      continue;
    }
    totalSeabornePatrolKm += p.totalDistanceKm;
    // Defensive: Prisma always returns a valid Date for startTime in
    // production, but mocked fixtures may omit it. Skip month bucketing
    // for entries with missing/invalid startedAt — the total still sums.
    if (
      !(p.startedAt instanceof Date) ||
      Number.isNaN(p.startedAt.getTime())
    ) {
      continue;
    }
    const month = tenantLocalMonthLabel(p.startedAt, offsetMinutes);
    const bucket = ensureBucket(month);
    bucket.seabornePatrolKm += p.totalDistanceKm;
  }

  const averageLitersPerKm =
    totalSeabornePatrolKm > 0 ? totalLiters / totalSeabornePatrolKm : null;

  const currency =
    fuelEntries[0]?.currency !== undefined &&
    typeof fuelEntries[0].currency === "string" &&
    fuelEntries[0].currency.length > 0
      ? fuelEntries[0].currency
      : "PHP";

  const perMonthBreakdown: PerAreaReportFuelMonthRow[] = Array.from(
    buckets.entries(),
  )
    .map(([month, b]) => ({
      month,
      liters: b.liters,
      cost: b.cost,
      seabornePatrolKm: b.seabornePatrolKm,
      litersPerKm:
        b.seabornePatrolKm > 0 ? b.liters / b.seabornePatrolKm : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalLiters,
    totalCost,
    currency,
    totalSeabornePatrolKm,
    averageLitersPerKm,
    entryCount,
    perMonthBreakdown,
  };
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
      locationLat: true,
      locationLon: true,
      eventType: {
        select: { id: true, value: true, display: true, category: true },
      },
    },
  });
  // Prisma's where: { not: null } guarantees eventTypeId is a string here.
  // Cast at the boundary to keep the helper signatures clean.
  const eventsTyped = events as ReadonlyArray<{
    eventTypeId: string;
    locationLat: number | null;
    locationLon: number | null;
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
  const lawEnforcementEventLocations = buildEventLocations(
    eventsTyped,
    LAW_ENFORCEMENT_NEEDLE,
  );
  const monitoringEventLocations = buildEventLocations(
    eventsTyped,
    MONITORING_NEEDLE,
  );

  const patrols = await prisma.patrol.findMany({
    where: {
      tenantId: tenant.id,
      areaBoundaryId: area.id,
      startTime: { gte: dateRange.start, lt: dateRange.end },
    },
    select: {
      id: true,
      patrolType: true,
      startTime: true,
      totalDistanceKm: true,
      totalHours: true,
      track: { select: { trackGeojson: true } },
    },
  });

  const patrolSummary = buildPatrolSummary(patrols);
  const patrolTracks = buildPatrolTracks(patrols);

  // ────────────────────────────────────────────────────────────────────
  // Page 3 — Fuel Consumption (6.2c)
  // FuelEntry is keyed by tenantId + areaBoundaryId + dateReceived (NOT
  // joined to Patrol). Fuel is allocated at area level per PRODUCT.md §128
  // ("Fuel is shared across all boats in an area"), so L/km is always an
  // aggregate ratio across the area + period window.
  // ────────────────────────────────────────────────────────────────────
  const fuelEntries = await prisma.fuelEntry.findMany({
    where: {
      tenantId: tenant.id,
      areaBoundaryId: area.id,
      dateReceived: { gte: dateRange.start, lt: dateRange.end },
    },
    select: {
      liters: true,
      totalPrice: true,
      currency: true,
      dateReceived: true,
    },
    orderBy: { dateReceived: "asc" },
  });

  const seabornePatrols: SeabornePatrolBucketInput[] = [];
  for (const p of patrols) {
    if (p.patrolType !== "seaborne") continue;
    seabornePatrols.push({
      startedAt: p.startTime,
      totalDistanceKm: p.totalDistanceKm,
    });
  }

  const fuelConsumption = buildFuelConsumption(
    fuelEntries,
    seabornePatrols,
    offsetMinutes,
  );

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
    lawEnforcementEventLocations,
    monitoringEventLocations,
    patrolTracks,
    fuelConsumption,
  };
}
