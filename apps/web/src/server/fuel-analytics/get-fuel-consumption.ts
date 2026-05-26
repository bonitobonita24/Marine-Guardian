/**
 * Cross-area fuel consumption aggregation for the /fuel analytics page.
 *
 * Distinct from the Per Area Report Page 3 builder (locked YYYY-MM
 * single-area design). This module supports:
 *   - cross-area aggregation (one or many AreaBoundaries, or all tenant areas)
 *   - 5 period grains (day / week / month / quarter / year)
 *   - per-area breakdown table data
 *   - summary KPIs (totalLiters, totalCost, totalSeabornePatrolKm, avg L/km)
 *
 * Fuel allocation is at the area level (PRODUCT.md §128 — "Fuel is shared
 * across all boats in an area — not tracked per individual boat"), so L/km
 * is always the aggregate ratio for the area + period window, never per-patrol.
 *
 * Currency snapshot: pulled from the first fuel entry returned by Prisma's
 * ordered query. Empty entries list → caller-provided defaultCurrency, or
 * "PHP" as the final fallback (mirrors per-area-report Page 3).
 *
 * Timezone handling: trend buckets are tenant-local (mirrors the per-area
 * report's offsetMinutes pattern). resolveTenantOffsetMinutes is duplicated
 * inline rather than imported from per-area-report — the helper there is
 * 5 lines and that module's design is locked. Extract to a shared util when
 * a 3rd consumer or DST support arrives.
 */

import { prisma } from "@marine-guardian/db";

export type FuelPeriodGrain = "day" | "week" | "month" | "quarter" | "year";

export interface FuelTrendBucket {
  /** Period label, e.g. "2026-05-26" / "2026-W22" / "2026-05" / "2026-Q2" / "2026". */
  bucket: string;
  /** UTC instant of the bucket start. Used for sorting and tooltip ranges. */
  startUtc: Date;
  liters: number;
  cost: number;
  seabornePatrolKm: number;
  /** null when seabornePatrolKm === 0 in this bucket (no divide). */
  litersPerKm: number | null;
}

export interface FuelPerAreaBreakdown {
  /** null for entries whose AreaBoundary was deleted (areaBoundaryId set null). */
  areaBoundaryId: string | null;
  /** Display name — first non-empty areaName snapshot for this group. */
  areaName: string;
  liters: number;
  cost: number;
  seabornePatrolKm: number;
  litersPerKm: number | null;
  entryCount: number;
}

export interface FuelConsumptionSummary {
  totalLiters: number;
  totalCost: number;
  totalSeabornePatrolKm: number;
  /** null when totalSeabornePatrolKm === 0 (no divide). */
  averageLitersPerKm: number | null;
  currency: string;
  entryCount: number;
}

export interface FuelConsumptionResult {
  summary: FuelConsumptionSummary;
  /** Alphabetical by areaName ASC. Null-area row sorts by its areaName too. */
  perArea: FuelPerAreaBreakdown[];
  /** Sorted by startUtc ASC. */
  trend: FuelTrendBucket[];
}

export interface GetFuelConsumptionInput {
  tenantId: string;
  /** undefined → no area filter (all tenant areas). Empty array also = all. */
  areaBoundaryIds?: readonly string[];
  /** Inclusive lower bound applied to FuelEntry.dateReceived and Patrol.startTime. */
  dateFrom: Date;
  /** Exclusive upper bound. */
  dateTo: Date;
  periodGrain: FuelPeriodGrain;
  /** IANA timezone name. Default "UTC". Forwarded to tenantLocalPeriodLabel. */
  timezone?: string;
  /** Currency to surface when entries list is empty. Falls back to "PHP" if unset. */
  defaultCurrency?: string;
}

/** Minutes east of UTC. Asia/Manila tenants are UTC+8 at v2 launch. */
const DEFAULT_TENANT_OFFSET_MINUTES = 480;

function resolveTenantOffsetMinutes(timezone: string): number {
  if (timezone === "UTC") return 0;
  // Proper IANA→offset resolution deferred until a DST-observing tenant
  // onboards. v2 launch tenants are all UTC+8 (Asia/Manila + Asia/Jakarta).
  return DEFAULT_TENANT_OFFSET_MINUTES;
}

/**
 * Returns the tenant-local period label + UTC bucket-start for a given
 * instant + period grain. Exported for unit testing — the bucketing rule
 * is the most likely place for off-by-one errors at month/quarter/year
 * boundaries.
 *
 * Bucket-start logic: shift the instant into tenant-local UTC, snap to the
 * period start (day/week-Monday/month-1/quarter-1/year-1), then shift back
 * to UTC. This guarantees that two instants in the same tenant-local period
 * hash to the same bucket regardless of how close they sit to the UTC
 * day boundary.
 */
export function tenantLocalPeriodLabel(
  d: Date,
  offsetMinutes: number,
  grain: FuelPeriodGrain,
): { label: string; startUtc: Date } {
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth(); // 0-11
  const day = shifted.getUTCDate();
  const pad2 = (n: number): string => String(n).padStart(2, "0");

  if (grain === "day") {
    const label = `${String(y)}-${pad2(m + 1)}-${pad2(day)}`;
    const startUtc = new Date(Date.UTC(y, m, day) - offsetMinutes * 60_000);
    return { label, startUtc };
  }

  if (grain === "week") {
    // ISO 8601 week: find Thursday of the current week, week# of that
    // Thursday's year. Monday=0..Sunday=6 in this helper.
    const tmp = new Date(Date.UTC(y, m, day));
    const dayOfWeek = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayOfWeek + 3); // Thursday
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(
      ((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
    );
    const label = `${String(isoYear)}-W${pad2(isoWeek)}`;
    // Bucket start = Monday 00:00 tenant-local
    const mondayUtc = Date.UTC(y, m, day - dayOfWeek);
    const startUtc = new Date(mondayUtc - offsetMinutes * 60_000);
    return { label, startUtc };
  }

  if (grain === "month") {
    const label = `${String(y)}-${pad2(m + 1)}`;
    const startUtc = new Date(Date.UTC(y, m, 1) - offsetMinutes * 60_000);
    return { label, startUtc };
  }

  if (grain === "quarter") {
    const q = Math.floor(m / 3) + 1;
    const label = `${String(y)}-Q${String(q)}`;
    const startUtc = new Date(
      Date.UTC(y, (q - 1) * 3, 1) - offsetMinutes * 60_000,
    );
    return { label, startUtc };
  }

  // year
  const label = String(y);
  const startUtc = new Date(Date.UTC(y, 0, 1) - offsetMinutes * 60_000);
  return { label, startUtc };
}

/** Coerces Prisma Decimal | number | string into a finite number, else null. */
function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object") {
    const fn = (v as { toNumber?: () => number }).toNumber;
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

interface RawFuelEntry {
  id: string;
  liters: unknown;
  totalPrice: unknown;
  currency: string;
  dateReceived: Date;
  areaBoundaryId: string | null;
  areaName: string;
}

interface RawPatrol {
  id: string;
  patrolType: string;
  startTime: Date | null;
  totalDistanceKm: number | null;
  areaBoundaryId: string | null;
}

interface PerAreaAccumulator {
  areaBoundaryId: string | null;
  areaName: string;
  liters: number;
  cost: number;
  seabornePatrolKm: number;
  entryCount: number;
}

interface TrendAccumulator {
  bucket: string;
  startUtc: Date;
  liters: number;
  cost: number;
  seabornePatrolKm: number;
}

export async function getFuelConsumption(
  input: GetFuelConsumptionInput,
): Promise<FuelConsumptionResult> {
  const offsetMinutes = resolveTenantOffsetMinutes(input.timezone ?? "UTC");
  const areaFilter =
    input.areaBoundaryIds !== undefined && input.areaBoundaryIds.length > 0
      ? { in: [...input.areaBoundaryIds] }
      : undefined;

  const [fuelEntries, patrols] = await Promise.all([
    prisma.fuelEntry.findMany({
      where: {
        tenantId: input.tenantId,
        ...(areaFilter !== undefined ? { areaBoundaryId: areaFilter } : {}),
        dateReceived: { gte: input.dateFrom, lt: input.dateTo },
      },
      select: {
        id: true,
        liters: true,
        totalPrice: true,
        currency: true,
        dateReceived: true,
        areaBoundaryId: true,
        areaName: true,
      },
      orderBy: { dateReceived: "asc" },
    }),
    prisma.patrol.findMany({
      where: {
        tenantId: input.tenantId,
        patrolType: "seaborne",
        ...(areaFilter !== undefined ? { areaBoundaryId: areaFilter } : {}),
        startTime: { gte: input.dateFrom, lt: input.dateTo },
      },
      select: {
        id: true,
        patrolType: true,
        startTime: true,
        totalDistanceKm: true,
        areaBoundaryId: true,
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const typedFuel = fuelEntries as ReadonlyArray<RawFuelEntry>;
  const typedPatrols = patrols as ReadonlyArray<RawPatrol>;

  const perAreaMap = new Map<string, PerAreaAccumulator>();
  const trendMap = new Map<string, TrendAccumulator>();
  const areaKey = (id: string | null): string => id ?? "__unallocated__";

  let totalLiters = 0;
  let totalCost = 0;
  let totalSeabornePatrolKm = 0;
  let entryCount = 0;

  const ensureArea = (
    id: string | null,
    name: string,
  ): PerAreaAccumulator => {
    const k = areaKey(id);
    let acc = perAreaMap.get(k);
    if (acc === undefined) {
      acc = {
        areaBoundaryId: id,
        areaName: name.length > 0 ? name : "Unallocated",
        liters: 0,
        cost: 0,
        seabornePatrolKm: 0,
        entryCount: 0,
      };
      perAreaMap.set(k, acc);
    }
    return acc;
  };

  const ensureTrendBucket = (
    label: string,
    startUtc: Date,
  ): TrendAccumulator => {
    let acc = trendMap.get(label);
    if (acc === undefined) {
      acc = {
        bucket: label,
        startUtc,
        liters: 0,
        cost: 0,
        seabornePatrolKm: 0,
      };
      trendMap.set(label, acc);
    }
    return acc;
  };

  for (const e of typedFuel) {
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

    const area = ensureArea(e.areaBoundaryId, e.areaName);
    area.liters += liters;
    area.cost += cost;
    area.entryCount += 1;

    const { label, startUtc } = tenantLocalPeriodLabel(
      e.dateReceived,
      offsetMinutes,
      input.periodGrain,
    );
    const bucket = ensureTrendBucket(label, startUtc);
    bucket.liters += liters;
    bucket.cost += cost;
  }

  for (const p of typedPatrols) {
    if (p.patrolType !== "seaborne") continue;
    if (p.totalDistanceKm === null || !Number.isFinite(p.totalDistanceKm)) {
      continue;
    }
    totalSeabornePatrolKm += p.totalDistanceKm;

    // Only attribute km to a perArea row if the patrol carries an
    // areaBoundaryId. Patrols without area still sum into the summary
    // total but are not part of any per-area row (no row to land on).
    if (p.areaBoundaryId !== null) {
      const area = ensureArea(p.areaBoundaryId, "");
      area.seabornePatrolKm += p.totalDistanceKm;
    }

    if (
      !(p.startTime instanceof Date) ||
      Number.isNaN(p.startTime.getTime())
    ) {
      continue;
    }
    const { label, startUtc } = tenantLocalPeriodLabel(
      p.startTime,
      offsetMinutes,
      input.periodGrain,
    );
    const bucket = ensureTrendBucket(label, startUtc);
    bucket.seabornePatrolKm += p.totalDistanceKm;
  }

  const averageLitersPerKm =
    totalSeabornePatrolKm > 0 ? totalLiters / totalSeabornePatrolKm : null;

  const firstEntry = typedFuel[0];
  const currency =
    firstEntry !== undefined &&
    typeof firstEntry.currency === "string" &&
    firstEntry.currency.length > 0
      ? firstEntry.currency
      : (input.defaultCurrency ?? "PHP");

  const perArea: FuelPerAreaBreakdown[] = Array.from(perAreaMap.values())
    .map((a) => ({
      areaBoundaryId: a.areaBoundaryId,
      areaName: a.areaName,
      liters: a.liters,
      cost: a.cost,
      seabornePatrolKm: a.seabornePatrolKm,
      litersPerKm:
        a.seabornePatrolKm > 0 ? a.liters / a.seabornePatrolKm : null,
      entryCount: a.entryCount,
    }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName));

  const trend: FuelTrendBucket[] = Array.from(trendMap.values())
    .map((b) => ({
      bucket: b.bucket,
      startUtc: b.startUtc,
      liters: b.liters,
      cost: b.cost,
      seabornePatrolKm: b.seabornePatrolKm,
      litersPerKm:
        b.seabornePatrolKm > 0 ? b.liters / b.seabornePatrolKm : null,
    }))
    .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());

  return {
    summary: {
      totalLiters,
      totalCost,
      totalSeabornePatrolKm,
      averageLitersPerKm,
      currency,
      entryCount,
    },
    perArea,
    trend,
  };
}
