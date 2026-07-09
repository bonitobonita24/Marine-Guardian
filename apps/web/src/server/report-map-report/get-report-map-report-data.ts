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
import {
  resolveMunicipalityScope,
  municipalityScopeClause,
} from "../reporting/municipality-scope";
import {
  buildSingleCountSeries,
  dayKeyToLabel,
} from "@/server/trpc/routers/time-series-bucketing";
import { BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI } from "@/server/report-map-report/assets/blue-alliance-default-logo";
import { buildGlobalEventTypeColumns } from "@/server/report-map-report/event-type-grouping";
import { isPointInAnyGeometry } from "@marine-guardian/shared/lib/municipality-assignment";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";

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
  /** "seaborne" | "foot" (or any other ER-supplied value) — feeds the
   *  per-type colored polyline (R1) and the Patrol Tracks Heatmap page's
   *  seaborne/foot point split (R5, 2026-07-06). */
  patrolType: string;
  path: { lat: number; lon: number }[];
}

/**
 * Soft cap on the number of heat points fed to ONE leaflet.heat layer on the
 * Patrol-Tracks-Heatmap page. That page renders TWO layers (seaborne + foot),
 * so the on-canvas worst case is ~2× this value.
 *
 * WHY A CAP / VISUAL-EQUIVALENCE RATIONALE: a leaflet.heat layer paints a
 * radial-gradient blob per input point and normalizes intensity across the
 * whole set. Once a track corridor is covered by a few thousand overlapping
 * blobs the gradient is fully saturated — every additional GPS vertex costs
 * canvas paint time (and RSC transfer bytes) without changing a single pixel.
 * A 1-year, up-to-300-track report otherwise pushes TENS OF THOUSANDS of
 * vertices per layer (the track query is `take: 300`, and a long-range track
 * carries hundreds–thousands of vertices). Down-sampling to a bounded set via
 * a uniform per-track stride (endpoints preserved — see
 * `capHeatLayerPoints`) yields a visually-equivalent heatmap at a fraction of
 * the point count. 6000 is a defensible, generous target: comfortably dense
 * for smooth coverage, ~an order of magnitude below the unbounded worst case.
 *
 * This is the SINGLE tuning knob for heat-layer density. It intentionally
 * does NOT touch the patrol-track POLYLINES or the municipality clip — those
 * keep full fidelity because each track's post-clip `path.length` is a
 * rendered value (the "Track Points" accessibility column in
 * report-map-report.tsx). Only the heat-layer feed is decimated.
 */
export const MAX_HEAT_POINTS_PER_LAYER = 6000;

/**
 * Decimate a single track's heat-point list to at most one point per `stride`
 * vertices, ALWAYS preserving the first and last vertex so the track's
 * spatial extent is never visually truncated. `stride <= 1` (or a track of
 * ≤ 2 points) returns the input array unchanged (referentially, so callers
 * can rely on pass-through). Pure + exported for unit testing.
 */
export function decimateHeatPointsByStride(
  points: HeatLatLng[],
  stride: number,
): HeatLatLng[] {
  if (stride <= 1 || points.length <= 2) return points;
  const out: HeatLatLng[] = [];
  for (let i = 0; i < points.length; i += stride) {
    const pt = points[i];
    if (pt !== undefined) out.push(pt);
  }
  const last = points[points.length - 1];
  if (last !== undefined && out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Cap a bucket of per-track heat-point lists to ~`maxPoints` total, applying
 * a UNIFORM per-track stride (every track thinned proportionally, endpoints
 * preserved) and returning the flattened point set. A bucket already at or
 * below `maxPoints` passes through unchanged (just flattened), so small
 * reports are byte-for-byte identical to the pre-downsampling behavior. The
 * result can exceed `maxPoints` by at most one appended endpoint per track.
 * Pure + exported for unit testing.
 */
export function capHeatLayerPoints(
  perTrack: HeatLatLng[][],
  maxPoints: number,
): HeatLatLng[] {
  let total = 0;
  for (const p of perTrack) total += p.length;
  if (total <= maxPoints) return perTrack.flat();
  const stride = Math.ceil(total / maxPoints);
  return perTrack.flatMap((p) => decimateHeatPointsByStride(p, stride));
}

/**
 * Splits patrol track path points into seaborne vs foot HeatLatLng tuples
 * (weight 1, no re-densification — `path` already comes from the same
 * tested `pointsFromTrackGeojson` pipeline the patrol-tracks polyline map
 * consumes) for the Patrol Tracks Heatmap page (R5, 2026-07-06). Tracks
 * whose `patrolType` is neither "seaborne" nor "foot" are ignored — this
 * heatmap only covers the two known patrol types (mirrors
 * buildPatrolTypeTotals' same convention). Exported as a pure helper for
 * unit testing.
 *
 * PERF (perf/report-heatpoint-downsample): each layer's point set is capped
 * at MAX_HEAT_POINTS_PER_LAYER via `capHeatLayerPoints` — a 1-year report
 * would otherwise feed tens of thousands of GPS vertices into each of the two
 * leaflet.heat layers. Below-cap reports pass through unchanged.
 */
export function buildPatrolHeatPoints(
  tracks: ReportMapTrackRow[],
): { seaborne: HeatLatLng[]; foot: HeatLatLng[] } {
  const seabornePerTrack: HeatLatLng[][] = [];
  const footPerTrack: HeatLatLng[][] = [];
  for (const t of tracks) {
    if (t.patrolType !== "seaborne" && t.patrolType !== "foot") continue;
    const bucket = t.patrolType === "seaborne" ? seabornePerTrack : footPerTrack;
    bucket.push(t.path.map((pt): HeatLatLng => [pt.lat, pt.lon, 1]));
  }
  return {
    seaborne: capHeatLayerPoints(seabornePerTrack, MAX_HEAT_POINTS_PER_LAYER),
    foot: capHeatLayerPoints(footPerTrack, MAX_HEAT_POINTS_PER_LAYER),
  };
}

/**
 * Clip patrol track path points to a single municipality's own geometry
 * (boundary ∪ water polygon) — fixes a cross-municipality leak (2026-07-06):
 * patrol→municipality attribution (`assignMunicipalityToDominantTrack`,
 * municipality-assignment package) is by DOMINANT track share, so a patrol
 * included in a single-municipality report's filter can still have
 * individual GPS points that physically sit in a NEIGHBORING municipality —
 * those stray points then rendered on the map/heatmap for the wrong town.
 *
 * Drops any path point that falls outside every geometry in `geometries`,
 * then drops the whole track if fewer than 2 points remain (mirrors the
 * `pts.length < 2` skip already applied when tracks are first built — a
 * single leftover point can't draw a polyline). Feeds BOTH the track
 * polyline map (Patrols page) and, via the same clipped `tracks` array,
 * `buildPatrolHeatPoints` (Patrol Tracks Heatmap page) — one clip step,
 * both consumers covered.
 *
 * No-op (returns `tracks` unchanged) when `geometries` is null — the
 * regional / all-municipality report path (`municipalityId` undefined, or a
 * municipality with no recorded geometry) keeps the existing
 * fit-to-data-points behavior with no clipping.
 *
 * Exported as a pure helper for unit testing (extracted from the loader
 * body, same convention as `buildPatrolHeatPoints`/`buildPatrolTypeTotals`).
 */
export function clipTracksToMunicipalityGeometry(
  tracks: ReportMapTrackRow[],
  geometries: unknown[] | null,
): ReportMapTrackRow[] {
  if (geometries === null) return tracks;
  const clipped: ReportMapTrackRow[] = [];
  for (const t of tracks) {
    const path = t.path.filter((pt) => isPointInAnyGeometry(pt, geometries));
    if (path.length < 2) continue;
    clipped.push({ ...t, path });
  }
  return clipped;
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
  /** Per-type (seaborne/foot) HeatLatLng point sets feeding the Patrol
   *  Tracks Heatmap page (R5, 2026-07-06) — see buildPatrolHeatPoints. */
  patrolHeatPoints: {
    seaborne: HeatLatLng[];
    foot: HeatLatLng[];
  };
}

export interface ReportMapTimeSeriesPoint {
  /** Sortable bucket key: `yyyy-MM-dd` (day/week-start) or `yyyy-MM` (month). */
  date: string;
  /** Adaptive display label per the shared bucketing rules (day/week/month —
   *  see time-series-bucketing.ts), e.g. "Jun 3" or "Jan 2026". */
  label: string;
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
   * Report-level municipality display name for the print header (2026-07-06
   * header redesign). "All Municipalities" for a regional/all-municipality
   * report (filter.municipalityId undefined); the resolved Municipality.name
   * when scoped to one municipality; null only if a municipalityId was set
   * but the municipality record could not be resolved (degrades gracefully —
   * the header simply omits the municipality line).
   */
  municipalityName: string | null;
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
  /**
   * Optional province rollup filter (2026-07-09): narrows the report to every
   * municipality within a given province. Ignored when `municipalityId` is
   * also set — a specific municipality selection always wins over a
   * province-wide rollup (see `resolveMunicipalityScope`).
   */
  province?: string;
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
  if (typeof p.province === "string" && p.province.length > 0) {
    out.province = p.province;
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
  // `province` is passed through verbatim — buildEventBreakdownWithCoords
  // (reportMap.ts) already resolves { municipalityId, province } via the
  // shared resolveMunicipalityScope helper, so the LE/Monitoring/High
  // Priority breakdown charts get province rollup for free.
  const filterInput = {
    from: params.from,
    to: params.to,
    municipalityId: params.municipalityId,
    province: params.province,
    protectedZoneId: params.protectedZoneId,
  };

  // Resolve the effective municipality scope ONCE: a specific municipalityId
  // always wins over province; province-only resolves to every municipality
  // in that province (tenant-scoped); neither set → undefined (no scoping).
  const municipalityIds = await resolveMunicipalityScope(tenant.id, {
    municipalityId: params.municipalityId,
    province: params.province,
  });

  const eventFilter: {
    tenantId: string;
    NOT: { eventType: { display: { contains: string; mode: "insensitive" } } };
    reportedAt?: { gte?: Date; lte?: Date };
    municipalityId?: string | { in: string[] };
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
  if (municipalityIds !== undefined) {
    eventFilter.municipalityId = municipalityScopeClause(municipalityIds);
  }
  if (params.protectedZoneId !== undefined) {
    eventFilter.coveredZones = { some: { protectedZoneId: params.protectedZoneId } };
  }

  const patrolFilter: {
    tenantId: string;
    isDeleted: false;
    isTestPatrol: false;
    startTime?: { gte?: Date; lte?: Date };
    municipalityId?: string | { in: string[] };
    coveredZones?: { some: { protectedZoneId: string } };
  } = { tenantId: tenant.id, isDeleted: false, isTestPatrol: false };
  if (params.from !== undefined || params.to !== undefined) {
    const startTime: { gte?: Date; lte?: Date } = {};
    if (params.from !== undefined) startTime.gte = params.from;
    if (params.to !== undefined) startTime.lte = params.to;
    patrolFilter.startTime = startTime;
  }
  if (municipalityIds !== undefined) {
    patrolFilter.municipalityId = municipalityScopeClause(municipalityIds);
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
          patrol: {
            select: {
              id: true,
              title: true,
              serialNumber: true,
              patrolType: true,
            },
          },
        },
      }),
    ]),
    // Municipality boundary + water geometry — only when the report is
    // scoped to a specific municipality. Feeds municipalityBounds below so
    // the print maps frame that municipality instead of the whole region.
    params.municipalityId !== undefined
      ? prisma.municipality.findUnique({
          where: { id: params.municipalityId },
          select: { name: true, boundaryGeojson: true, waterGeojson: true },
        })
      : Promise.resolve(null),
  ] as const);

  // Water-centered framing (R10): prefer the municipal WATER polygon alone
  // (a ~15km municipal-water boundary, land subtracted) over the union with
  // the land boundary — the water-only bound crops the inland territory so
  // the print map centers on the coastline + municipal water instead of a
  // loose, land-inclusive frame. Falls back to the land boundary when a
  // municipality has no waterGeojson recorded.
  const municipalityBounds: ReportMapBounds | null = municipalityGeometry
    ? unionGeometryBounds(
        municipalityGeometry.waterGeojson ?? municipalityGeometry.boundaryGeojson,
      )
    : null;

  // Header municipality line (2026-07-06 header redesign; province rollup
  // added 2026-07-09): the resolved Municipality.name when scoped to one
  // municipality (or null if the id didn't resolve — header degrades
  // gracefully and omits the line); the province name when scoped to a
  // province rollup (no specific municipalityId); "All Municipalities"
  // for a fully regional report (neither filter set).
  const municipalityName: string | null =
    params.municipalityId !== undefined
      ? (municipalityGeometry?.name ?? null)
      : (params.province ?? "All Municipalities");

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

  // Bucket patrols by startTime + patrolType. When both range bounds are
  // present, reuse the SAME adaptive month/week/day bucketing (continuous,
  // zero-filled, no truncation) that the /map "Events vs Patrols Over Time"
  // chart uses, so a long report is never cut short. With no bounds, fall
  // back to sparse day-keyed points (still labeled).
  const seaborneDates: Date[] = [];
  const footDates: Date[] = [];
  for (const p of patrolRows) {
    if (p.startTime === null) continue;
    if (p.patrolType === "seaborne") {
      seaborneDates.push(p.startTime);
    } else {
      footDates.push(p.startTime);
    }
  }

  const sparseSeries = (dates: Date[]): ReportMapTimeSeriesPoint[] => {
    const counts: Record<string, number> = {};
    for (const d of dates) {
      const k = dayKey(d);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([date, count]) => ({ date, label: dayKeyToLabel(date), count }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  };

  const patrolCountByTypeOverTime =
    params.from !== undefined && params.to !== undefined
      ? {
          seaborne: buildSingleCountSeries(seaborneDates, params.from, params.to),
          foot: buildSingleCountSeries(footDates, params.from, params.to),
        }
      : {
          seaborne: sparseSeries(seaborneDates),
          foot: sparseSeries(footDates),
        };

  const rawTracks: ReportMapTrackRow[] = [];
  for (const row of trackRows) {
    const pts = pointsFromTrackGeojson(row.trackGeojson);
    if (pts.length < 2) continue;
    rawTracks.push({
      patrolId: row.patrol.id,
      label: row.patrol.title ?? row.patrol.serialNumber ?? row.patrol.id,
      patrolType: row.patrol.patrolType,
      path: pts.map(({ lat, lon }) => ({ lat, lon })),
    });
  }

  // Single-municipality report with geometry on record: clip stray
  // out-of-municipality track points (dominant-track attribution is by
  // majority share, not full containment — see
  // clipTracksToMunicipalityGeometry doc). Regional reports / a
  // municipality with no geometry keep every point (geometries === null).
  const municipalityGeometries: unknown[] | null =
    municipalityGeometry
      ? [municipalityGeometry.boundaryGeojson, municipalityGeometry.waterGeojson]
      : null;
  const tracks = clipTracksToMunicipalityGeometry(rawTracks, municipalityGeometries);

  const patrolList: PatrolListChartData = {
    key: "patrol_list",
    title: "Patrol List",
    total: patrolRows.length,
    breakdown: patrolBreakdown,
    tracks,
    patrolTotals,
    patrolCountByTypeOverTime,
    patrolHeatPoints: buildPatrolHeatPoints(tracks),
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

  // Adaptive bucketing (month/week/day, continuous, no 400-day cap — see
  // time-series-bucketing.ts) reusing the SAME core as the /map "Events vs
  // Patrols Over Time" chart, so a >400-day report is never truncated.
  let series: ReportMapTimeSeriesPoint[];
  if (params.from !== undefined && params.to !== undefined) {
    const eventDates = allEventRows
      .map((e) => e.reportedAt)
      .filter((d): d is Date => d !== null);
    series = buildSingleCountSeries(eventDates, params.from, params.to);
  } else {
    series = Object.entries(dayCounts)
      .map(([date, count]) => ({ date, label: dayKeyToLabel(date), count }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  const eventsOverTime: EventsOverTimeChartData = {
    key: "events_over_time",
    title: "Events Over Time",
    // Full count over [from,to] — independent of the (possibly bucketed)
    // series above, so it can never be truncated by the series' granularity.
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
    municipalityName,
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
