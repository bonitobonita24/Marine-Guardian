/**
 * municipality tRPC router.
 *
 * A thin lookup router for the Interactive Report Map (2026-06-27): the report
 * surface needs a flat {id, name, province, slug} list to populate the
 * municipality filter Select. Activity aggregations (patrol/event counts) live
 * in municipalityCoverage.ts — this router is identity/labels only.
 *
 * Tenant-scoped via tenantProcedure (ctx.tenantId).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import { MUNICIPALITIES } from "@/data/coverage/coverage-areas";
import { assignZonesToPoint } from "@marine-guardian/shared/lib/municipality-assignment";
import { importOfficialBoundaries } from "@/server/boundaries/import-official-boundaries";
import {
  normalizeMpaGeometry,
  toFeatureCollection,
  slugifyMpaName,
  MpaGeometryError,
} from "@/server/boundaries/mpa-geojson";

// Canonical display order = owner's province-grouped list (coverage-areas.ts).
// Map each municipality slug → its registry index; anything not in the registry
// sorts last (alphabetically) as a safety net.
const ORDER_BY_SLUG = new Map(MUNICIPALITIES.map((m, i) => [m.id, i]));

// Coverage-junction inserts are chunked so a large MPA never exceeds PostgreSQL's
// 65,535 bind-parameter cap (rows × 4 columns must stay well under it).
const COVERAGE_INSERT_CHUNK = 5_000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const municipalityRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await prisma.municipality.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, province: true, slug: true },
    });
    return rows.sort((a, b) => {
      const ia = ORDER_BY_SLUG.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
      const ib = ORDER_BY_SLUG.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name);
    });
  }),

  // Protected zones (MPAs) for the Report Map MPA-scope filter Select. A flat
  // {id, name, parentMunicipalityId} list — the filter narrows events/patrols
  // to a single zone via the EventCoveredZone / PatrolCoveredZone joins.
  protectedZones: tenantProcedure.query(async ({ ctx }) => {
    return prisma.protectedZone.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, slug: true, category: true, parentMunicipalityId: true },
      orderBy: { name: "asc" },
    });
  }),

  /**
   * Create a named sub-boundary (ProtectedZone) under a municipality from a
   * user-uploaded KML/KMZ — either an MPA or a "special area". Both behave
   * identically: a filterable coverage zone so the owner can see only the
   * events/patrols inside THAT sub-area, separate from the whole municipality.
   * `category` drives only the UI label.
   *
   * The client parses the file into GeoJSON (browser DOMParser + @tmcw/togeojson,
   * JSZip for KMZ) and sends it here. The server is the trusted boundary:
   * normalizeMpaGeometry validates + collapses it to one Polygon/MultiPolygon.
   * Flow:
   *   1. validate name + geometry + parent municipality,
   *   2. create the ProtectedZone (FeatureCollection-wrapped, seed convention),
   *   3. importOfficialBoundaries() regenerates the official AreaBoundary overlay
   *      records — the new zone shows on both maps via map.officialBoundaries.list,
   *   4. backfill historical coverage by point (events by location, patrols by
   *      start point) so counts appear immediately. Future ER syncs cover the
   *      zone automatically (the municipality-assign processor loads all zones
   *      from the DB, track-based for patrols).
   *
   * Admin-only (super_admin / site_admin). Tenant-scoped.
   */
  createBoundaryFromUpload: adminProcedure
    .input(
      z
        .object({
          name: z.string().trim().min(2).max(120),
          geojson: z.unknown(),
          category: z.enum(["mpa", "special_area"]),
          parentMunicipalityId: z.string().cuid(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;

      // 1a. Validate + normalize geometry (throws MpaGeometryError → BAD_REQUEST).
      let normalized;
      try {
        normalized = normalizeMpaGeometry(input.geojson);
      } catch (err) {
        if (err instanceof MpaGeometryError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The uploaded file could not be read as a map boundary.",
        });
      }

      // 1b. Name → slug, enforce uniqueness within the tenant.
      const slug = slugifyMpaName(input.name);
      if (slug.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please enter a name with at least one letter or number.",
        });
      }
      const existing = await prisma.protectedZone.findFirst({
        where: { tenantId, slug },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An MPA named "${input.name}" already exists. Choose a different name.`,
        });
      }

      // 1c. Verify the parent municipality belongs to this tenant.
      const parent = await prisma.municipality.findFirst({
        where: { id: input.parentMunicipalityId, tenantId },
        select: { id: true },
      });
      if (!parent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The selected parent municipality was not found.",
        });
      }

      // 2. Create the ProtectedZone (boundary stored as FeatureCollection).
      const zone = await prisma.protectedZone.create({
        data: {
          tenantId,
          slug,
          name: input.name,
          category: input.category,
          boundaryGeojson: toFeatureCollection(normalized.geometry, {
            name: input.name,
            category: input.category,
            source: "user-upload",
            uploadedByUserId: userId,
          }) as object,
          parentMunicipalityId: input.parentMunicipalityId,
        },
        select: { id: true, slug: true, name: true, boundaryGeojson: true },
      });

      // 3. Regenerate official overlay records (idempotent) — picks up the new
      //    zone as official:mpa:<slug> so it renders on both maps.
      await importOfficialBoundaries(prisma, tenantId, userId);

      // 4. Backfill historical coverage by point (events: location; patrols:
      //    start point — avoids loading every track; new data is covered
      //    track-based by the sync processor going forward).
      const zoneForAssign = [
        {
          id: zone.id,
          slug: zone.slug,
          name: zone.name,
          boundaryGeojson: zone.boundaryGeojson,
        },
      ];
      const now = new Date();

      const events = await prisma.event.findMany({
        where: { tenantId, locationLat: { not: null }, locationLon: { not: null } },
        select: { id: true, locationLat: true, locationLon: true },
      });
      const eventRows = events
        .filter(
          (e) =>
            assignZonesToPoint(
              { lat: e.locationLat as number, lon: e.locationLon as number },
              zoneForAssign,
            ).length > 0,
        )
        .map((e) => ({ tenantId, eventId: e.id, protectedZoneId: zone.id, assignedAt: now }));
      for (const batch of chunk(eventRows, COVERAGE_INSERT_CHUNK)) {
        await prisma.eventCoveredZone.createMany({ data: batch, skipDuplicates: true });
      }

      const patrols = await prisma.patrol.findMany({
        where: {
          tenantId,
          startLocationLat: { not: null },
          startLocationLon: { not: null },
        },
        select: { id: true, startLocationLat: true, startLocationLon: true },
      });
      const patrolRows = patrols
        .filter(
          (p) =>
            assignZonesToPoint(
              { lat: p.startLocationLat as number, lon: p.startLocationLon as number },
              zoneForAssign,
            ).length > 0,
        )
        .map((p) => ({ tenantId, patrolId: p.id, protectedZoneId: zone.id, assignedAt: now }));
      for (const batch of chunk(patrolRows, COVERAGE_INSERT_CHUNK)) {
        await prisma.patrolCoveredZone.createMany({ data: batch, skipDuplicates: true });
      }

      // 5. Audit (mirror areaBoundary.importOfficial).
      await prisma.auditLog.create({
        data: {
          action: "ZONE_UPLOAD_CREATE",
          userId,
          tenantId,
          entityType: "ProtectedZone",
          entityId: zone.id,
          changesJson: {
            name: input.name,
            slug,
            category: input.category,
            parentMunicipalityId: input.parentMunicipalityId,
            vertexCount: normalized.vertexCount,
            eventCount: eventRows.length,
            patrolCount: patrolRows.length,
          },
        },
      });

      return {
        protectedZoneId: zone.id,
        name: zone.name,
        category: input.category,
        eventCount: eventRows.length,
        patrolCount: patrolRows.length,
      };
    }),
});
