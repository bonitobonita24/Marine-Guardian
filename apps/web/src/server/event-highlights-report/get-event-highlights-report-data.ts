/**
 * Server-side data loader for the "Event Highlights" printable report.
 *
 * Consumed by /print-render/[tenantSlug]/[reportType]/[exportId]/page.tsx when
 * reportType === "event_highlights". Selects a curated, photo-forward subset
 * of events within the report's scope/date range — events that (a) are not
 * Skylight-sourced, (b) carry at least one displayable photo, and (c) carry a
 * human narrative (actionTaken and/or a remarks-like field) — and shapes them
 * into print-ready "highlight blocks" sorted by photo richness.
 *
 * Mirrors the null-contract of get-report-map-report-data.ts. Returns null when:
 *   - the tenant slug does not exist
 *   - the export id does not exist
 *   - the export belongs to a different tenant
 *   - the export's reportType is not "event_highlights"
 *
 * NOTE (main-branch schema): this branch's Prisma schema has NO
 * `EventFieldValue` table — ER per-type field data lives on
 * `Event.eventDetailsJson` (raw ER field payload) and `Event.notesJson`
 * (freeform notes), both scanned by `extractRemarks` below.
 *
 * Reused (imported) helpers — see "which helpers" note in the PR description:
 *   - `parseReportMapParams`   from the report-map loader (scope/date param parsing)
 *   - `resolveMunicipalityScope` + `buildMunicipalityScopeWhere` from
 *     `../reporting/municipality-scope` (municipality/province/child-zone scope)
 *   - `resolveLogoDataUri` is NOT exported by the report-map loader (private,
 *     module-scoped) — its minimal logic is replicated below with a comment.
 *   - `photoAssetIdsFrom` from the reportMap tRPC router (displayable asset ids)
 *   - `isSkylightDisplay` from the map event-marker-style module (Skylight exclusion)
 */

import { prisma } from "@marine-guardian/db";
import { getImageBytes, getExportsBucketName } from "@marine-guardian/storage";
import { parseReportMapParams } from "@/server/report-map-report/get-report-map-report-data";
import { photoAssetIdsFrom } from "@/server/trpc/routers/reportMap";
import { isSkylightDisplay } from "@/components/map/eventMarkerStyle";
import {
  resolveMunicipalityScope,
  resolveChildZoneIds,
  buildMunicipalityScopeWhere,
} from "../reporting/municipality-scope";
import { BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI } from "@/server/report-map-report/assets/blue-alliance-default-logo";

// ─── Shapes ───────────────────────────────────────────────────────────────

export interface EventHighlightsEventBlock {
  id: string;
  title: string;
  typeDisplay: string;
  reportedAt: Date | null;
  municipalityName: string | null;
  areaName: string | null;
  lat: number | null;
  lon: number | null;
  reportedByName: string | null;
  actionTaken: string | null;
  remarks: string | null;
  /** Displayable EventAsset ids, capped to at most 8. */
  photoAssetIds: string[];
  /** Pre-cap displayable-photo count (may exceed photoAssetIds.length). */
  photoCount: number;
  /** "half" (≤2 photos) vs "full" (>2 photos) print-page layout hint. */
  layout: "half" | "full";
}

export interface EventHighlightsTemplate {
  id: string | null;
  name: string;
  layout: string;
  reportTitle: string;
  footerNotes: string | null;
  municipalLogoDataUri: string | null;
  /** Never null — falls back to the bundled Blue Alliance default logo. */
  partnerLogoDataUri: string;
}

export interface EventHighlightsReportData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  template: EventHighlightsTemplate;
  generatedAt: Date;
  filter: {
    from: Date | undefined;
    to: Date | undefined;
    municipalityId: string | undefined;
    protectedZoneId: string | undefined;
  };
  /** The ProtectedZone's own name when protectedZoneId is set; else the
   *  resolved Municipality.name when municipalityId is set; else the
   *  province name; else "All Municipalities". */
  scopeTitle: string | null;
  /** True when scoped to a whole PROVINCE (no municipalityId, no
   *  protectedZoneId) — mirrors ReportMapReportData.isRegionReport. */
  isRegionReport: boolean;
  blocks: EventHighlightsEventBlock[];
  /** Count of qualifying events BEFORE the 25-block cap. */
  totalQualifying: number;
}

// ─── App-default template (no logos, minimal layout) ──────────────────────
// Mirrors APP_DEFAULT_TEMPLATE in get-report-map-report-data.ts.

const APP_DEFAULT_TEMPLATE = {
  id: null as string | null,
  name: "Default",
  layout: "two-column",
  reportTitle: "Marine Guardian Report",
  footerNotes: null as string | null,
  municipalLogoKey: null as string | null,
  partnerLogoKey: null as string | null,
};

const MAX_BLOCKS = 25;
const MAX_PHOTOS_PER_BLOCK = 8;

// ─── Logo resolution ────────────────────────────────────────────────────────
// REPLICATED (not imported): `resolveLogoDataUri` in the report-map loader is
// module-private (not exported). Minimal logic duplicated verbatim here.

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

// ─── Remarks extraction ─────────────────────────────────────────────────────

const REMARKS_KEY_PATTERN = /remark|note|narrative/i;

/**
 * Scans `notesJson` (a plain non-empty string, or an object/array containing
 * a text-like value) and `eventDetailsJson` (an object whose keys match
 * /remark|note|narrative/i and whose value is a non-empty string) for a
 * human-readable remarks string. Returns the first match found, trimmed, or
 * null if none is found. Pure + exported for reuse/testing.
 */
export function extractRemarks(event: {
  notesJson: unknown;
  eventDetailsJson: unknown;
}): string | null {
  const fromNotes = extractFromNotesJson(event.notesJson);
  if (fromNotes !== null) return fromNotes;
  return extractFromEventDetailsJson(event.eventDetailsJson);
}

function extractFromNotesJson(notesJson: unknown): string | null {
  if (typeof notesJson === "string") {
    const trimmed = notesJson.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(notesJson)) {
    for (const entry of notesJson) {
      const found = extractFromNotesJson(entry);
      if (found !== null) return found;
      if (typeof entry === "object" && entry !== null) {
        const rec = entry as Record<string, unknown>;
        for (const [key, value] of Object.entries(rec)) {
          if (REMARKS_KEY_PATTERN.test(key) && typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length > 0) return trimmed;
          }
          if (typeof value === "string" && key.toLowerCase() === "text") {
            const trimmed = value.trim();
            if (trimmed.length > 0) return trimmed;
          }
        }
      }
    }
    return null;
  }
  if (typeof notesJson === "object" && notesJson !== null) {
    const rec = notesJson as Record<string, unknown>;
    for (const [key, value] of Object.entries(rec)) {
      if (REMARKS_KEY_PATTERN.test(key) && typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
      }
      if (typeof value === "string" && key.toLowerCase() === "text") {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
  }
  return null;
}

function extractFromEventDetailsJson(eventDetailsJson: unknown): string | null {
  if (typeof eventDetailsJson !== "object" || eventDetailsJson === null) return null;
  const rec = eventDetailsJson as Record<string, unknown>;
  for (const [key, value] of Object.entries(rec)) {
    if (REMARKS_KEY_PATTERN.test(key) && typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

// ─── Main loader ─────────────────────────────────────────────────────────────

export async function getEventHighlightsReportData(
  tenantSlug: string,
  exportId: string,
): Promise<EventHighlightsReportData | null> {
  // 1. Tenant + export guard (same null contract as report-map loader)
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
  if (reportExport.reportType !== "event_highlights") return null;

  // 2. Parse params + resolve template (mirrors report-map loader)
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

  // 3. Resolve municipality/province/protected-zone scope (mirrors
  // report-map loader's eventFilter construction).
  const municipalityIds = await resolveMunicipalityScope(tenant.id, {
    municipalityId: params.municipalityId,
    province: params.province,
  });

  const childZoneIds =
    params.includeChildren === true && municipalityIds !== undefined
      ? await resolveChildZoneIds(tenant.id, municipalityIds)
      : undefined;

  const eventFilter: {
    tenantId: string;
    // DB-level pre-filter: only events that have at least one attachment row.
    // The JS pass below still enforces the stricter "≥1 *displayable* photo"
    // rule (photoAssetIdsFrom), but this keeps the query from loading the
    // thousands of asset-less events (e.g. automated Skylight pings) that can
    // never qualify — a safe strict superset, not a behavior change.
    assets: { some: Record<string, never> };
    reportedAt?: { gte?: Date; lte?: Date };
    municipalityId?: string | { in: string[] };
    coveredZones?: { some: { protectedZoneId: string } };
    OR?: [
      { municipalityId: string | { in: string[] } },
      { coveredZones: { some: { protectedZoneId: { in: string[] } } } },
    ];
  } = { tenantId: tenant.id, assets: { some: {} } };

  if (params.from !== undefined || params.to !== undefined) {
    const reportedAt: { gte?: Date; lte?: Date } = {};
    if (params.from !== undefined) reportedAt.gte = params.from;
    if (params.to !== undefined) reportedAt.lte = params.to;
    eventFilter.reportedAt = reportedAt;
  }
  if (municipalityIds !== undefined) {
    const scope = buildMunicipalityScopeWhere(municipalityIds, childZoneIds);
    if ("OR" in scope) {
      eventFilter.OR = scope.OR;
    } else {
      eventFilter.municipalityId = scope.municipalityId;
    }
  }
  if (params.protectedZoneId !== undefined) {
    eventFilter.coveredZones = { some: { protectedZoneId: params.protectedZoneId } };
  }

  // 4. Fetch logos + municipality/zone header info + candidate events
  // concurrently (independent reads).
  const [
    [municipalLogoDataUri, resolvedPartnerLogoDataUri],
    municipalityRow,
    protectedZoneRow,
    eventRows,
  ] = await Promise.all([
    Promise.all([
      resolveLogoDataUri(templateSource.municipalLogoKey),
      resolveLogoDataUri(templateSource.partnerLogoKey),
    ]),
    params.municipalityId !== undefined
      ? prisma.municipality.findUnique({
          where: { id: params.municipalityId },
          select: { name: true },
        })
      : Promise.resolve(null),
    params.protectedZoneId !== undefined
      ? prisma.protectedZone.findUnique({
          where: { id: params.protectedZoneId },
          select: { name: true },
        })
      : Promise.resolve(null),
    prisma.event.findMany({
      where: eventFilter,
      orderBy: { reportedAt: "desc" },
      select: {
        id: true,
        title: true,
        priority: true,
        state: true,
        reportedAt: true,
        locationLat: true,
        locationLon: true,
        areaName: true,
        reportedByName: true,
        actionTaken: true,
        notesJson: true,
        eventDetailsJson: true,
        hasPhoto: true,
        eventType: { select: { display: true, category: true } },
        municipality: { select: { name: true } },
        municipalityId: true,
        assets: {
          select: { id: true, mimeType: true, filename: true, telegramFileId: true },
        },
      },
    }),
  ] as const);

  // ─── Header scope title (ProtectedZone name > Municipality name > province
  // > "All Municipalities") ───────────────────────────────────────────────
  const scopeTitle: string | null =
    protectedZoneRow?.name ??
    (params.municipalityId !== undefined
      ? (municipalityRow?.name ?? null)
      : (params.province ?? "All Municipalities"));

  const isRegionReport =
    params.municipalityId === undefined &&
    params.protectedZoneId === undefined &&
    params.province !== undefined;

  // ─── Build + filter highlight blocks ───────────────────────────────────
  const qualifying: { block: EventHighlightsEventBlock; reportedAt: Date | null }[] = [];

  for (const e of eventRows) {
    // Exclude Skylight-sourced events.
    if (isSkylightDisplay(e.eventType?.display ?? "")) continue;

    // Must have at least one displayable photo.
    const allPhotoAssetIds = photoAssetIdsFrom(e.assets);
    const photoCount = allPhotoAssetIds.length;
    if (photoCount === 0) continue;

    // Must have a human narrative (actionTaken and/or remarks-like text).
    const actionTaken = e.actionTaken?.trim() || null;
    const remarks = extractRemarks(e);
    if (actionTaken === null && remarks === null) continue;

    const photoAssetIds = allPhotoAssetIds.slice(0, MAX_PHOTOS_PER_BLOCK);

    const block: EventHighlightsEventBlock = {
      id: e.id,
      title: e.title ?? e.eventType?.display ?? "Event",
      typeDisplay: e.eventType?.display ?? "",
      reportedAt: e.reportedAt,
      municipalityName: e.municipality?.name ?? null,
      areaName: e.areaName ?? null,
      lat: e.locationLat ?? null,
      lon: e.locationLon ?? null,
      reportedByName: e.reportedByName ?? null,
      actionTaken,
      remarks,
      photoAssetIds,
      photoCount,
      layout: photoCount <= 2 ? "half" : "full",
    };

    qualifying.push({ block, reportedAt: e.reportedAt });
  }

  const totalQualifying = qualifying.length;

  qualifying.sort((a, b) => {
    if (a.block.photoCount !== b.block.photoCount) {
      return b.block.photoCount - a.block.photoCount;
    }
    // Tiebreak reportedAt DESC, nulls last.
    if (a.reportedAt === null && b.reportedAt === null) return 0;
    if (a.reportedAt === null) return 1;
    if (b.reportedAt === null) return -1;
    return b.reportedAt.getTime() - a.reportedAt.getTime();
  });

  const blocks = qualifying.slice(0, MAX_BLOCKS).map((q) => q.block);

  // Partner logo default fallback (mirrors report-map loader): never null.
  const partnerLogoDataUri =
    resolvedPartnerLogoDataUri ?? BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI;

  const template: EventHighlightsTemplate = {
    id: templateSource.id,
    name: templateSource.name,
    layout: templateSource.layout,
    reportTitle: templateSource.reportTitle,
    footerNotes: templateSource.footerNotes,
    municipalLogoDataUri,
    partnerLogoDataUri,
  };

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
    },
    template,
    generatedAt: new Date(),
    filter: {
      from: params.from,
      to: params.to,
      municipalityId: params.municipalityId,
      protectedZoneId: params.protectedZoneId,
    },
    scopeTitle,
    isRegionReport,
    blocks,
    totalQualifying,
  };
}
