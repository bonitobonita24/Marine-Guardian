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
import { adminProcedure, matrixProcedure } from "../middleware/rbac";
import { prisma, Prisma } from "@marine-guardian/db";
import { MUNICIPALITIES } from "@/data/coverage/coverage-areas";
import { assignZonesToPoint } from "@marine-guardian/shared/lib/municipality-assignment";
import { importOfficialBoundaries } from "@/server/boundaries/import-official-boundaries";
import {
  normalizeMpaGeometry,
  toFeatureCollection,
  slugifyMpaName,
  MpaGeometryError,
} from "@/server/boundaries/mpa-geojson";
import { fanOutAreaRederive, fanOutMunicipalityReassign } from "./areaBoundary";

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
  list: matrixProcedure(tenantProcedure, "patrol-areas", "view").query(async ({ ctx }) => {
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
  protectedZones: matrixProcedure(tenantProcedure, "patrol-areas", "view").query(async ({ ctx }) => {
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
  createBoundaryFromUpload: matrixProcedure(adminProcedure, "patrol-areas", "write")
    .input(
      z
        .object({
          name: z.string().trim().min(2).max(120),
          geojson: z.unknown(),
          category: z.enum(["mpa", "special_area", "hotspot", "custom"]),
          parentMunicipalityId: z.string().cuid(),
          terrain: z.enum(["land", "water"]).default("land"),
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
          terrain: input.terrain,
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

  /**
   * Create a brand-new Layer-1 Municipality from a user-uploaded KML/KMZ
   * boundary. Unlike createBoundaryFromUpload (which creates a ProtectedZone
   * sub-boundary under an existing municipality), this creates the top-level
   * Municipality record itself — used when the coverage area is entirely new
   * (not a subdivision of an existing municipality).
   *
   * The uploaded geometry always becomes the LAND boundary (boundaryGeojson).
   * Water/municipal-waters geometry is added later via the existing
   * replaceBoundaryGeometry(kind: "water") mutation — no terrain param here.
   *
   * Admin-only (super_admin / site_admin). Tenant-scoped.
   */
  createMunicipalityFromUpload: matrixProcedure(adminProcedure, "patrol-areas", "write")
    .input(
      z
        .object({
          name: z.string().trim().min(2).max(120),
          geojson: z.unknown(),
          province: z.enum(["Oriental Mindoro", "Occidental Mindoro", "Palawan"]),
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
      const existing = await prisma.municipality.findFirst({
        where: { tenantId, slug },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A municipality named "${input.name}" already exists. Choose a different name.`,
        });
      }

      // 2. Create the Municipality (land boundary stored as FeatureCollection).
      const muni = await prisma.municipality.create({
        data: {
          tenantId,
          slug,
          name: input.name,
          province: input.province,
          boundaryGeojson: toFeatureCollection(normalized.geometry, {
            boundaryType: "municipality-land",
            uploadedAt: new Date().toISOString(),
            uploadedByUserId: userId,
          }) as object,
          landBoundaryManual: true,
        },
        select: { id: true, slug: true, name: true },
      });

      // 3. Regenerate official overlay records (idempotent) — picks up the
      // new municipality so it renders on both maps.
      await importOfficialBoundaries(prisma, tenantId, userId);

      // 4. Fan out area re-derivation for every Event/Patrol/FuelEntry in the
      // tenant — the municipality universe changed, so previously-derived
      // areaBoundaryId assignments may now be stale.
      const fanOut = await fanOutAreaRederive(tenantId, userId);

      // 4b. Fan out municipality re-attribution — a brand-new municipality
      // means some Events/Patrols may now belong to it instead of whatever
      // municipality previously contained (or nearest-matched) that point.
      const municipalityFanOut = await fanOutMunicipalityReassign(tenantId, userId);

      // 5. Audit.
      await prisma.auditLog.create({
        data: {
          action: "MUNICIPALITY_UPLOAD_CREATE",
          userId,
          tenantId,
          entityType: "Municipality",
          entityId: muni.id,
          changesJson: {
            name: input.name,
            slug,
            province: input.province,
            vertexCount: normalized.vertexCount,
            enqueuedJobs: fanOut.enqueued,
            municipalityReassignJobs: municipalityFanOut.enqueued,
          },
        },
      });

      return {
        municipalityId: muni.id,
        name: muni.name,
        province: input.province,
        enqueuedJobs: fanOut.enqueued,
        municipalityReassignJobs: municipalityFanOut.enqueued,
      };
    }),

  /**
   * Replace a municipality's land or water boundary geometry with a new
   * user-uploaded polygon. The prior geometry is snapshotted first
   * (MunicipalityBoundarySnapshot) so it can be recovered/audited later.
   * After the swap: regenerate the official AreaBoundary overlay (land/water
   * shows the new shape on both maps) and fan out area re-derivation for
   * every Event/Patrol/FuelEntry in the tenant (the municipality universe
   * changed, so previously-derived assignments may now be stale) — reusing
   * the exact fanOutAreaRederive helper from areaBoundary.rebuild.
   *
   * Admin-only (super_admin / site_admin). Tenant-scoped.
   */
  replaceBoundaryGeometry: matrixProcedure(adminProcedure, "patrol-areas", "update")
    .input(
      z
        .object({
          municipalityId: z.string().cuid(),
          kind: z.enum(["land", "water"]),
          geojson: z.unknown(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;

      // 1. Validate + normalize the uploaded geometry (throws MpaGeometryError → BAD_REQUEST).
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

      // 2. Verify the target municipality belongs to this tenant. Do not
      // reveal existence to callers scoped to a different tenant.
      const municipality = await prisma.municipality.findFirst({
        where: { id: input.municipalityId, tenantId },
        select: { id: true, name: true, slug: true, boundaryGeojson: true, waterGeojson: true },
      });
      if (!municipality) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Boundary not found." });
      }

      const newGeojson = toFeatureCollection(normalized.geometry, {
        boundaryType:
          input.kind === "land" ? "municipality-land" : "municipality-water-uploaded",
        uploadedAt: new Date().toISOString(),
        uploadedByUserId: userId,
      }) as object;

      // 3. Snapshot the prior geometry, then swap in the new one — atomically.
      await prisma.$transaction(async (tx) => {
        const previousGeojson =
          input.kind === "land" ? municipality.boundaryGeojson : municipality.waterGeojson;

        await tx.municipalityBoundarySnapshot.create({
          data: {
            tenantId,
            municipalityId: municipality.id,
            kind: input.kind,
            ...(previousGeojson !== null
              ? { previousGeojson: previousGeojson as object }
              : {}),
            replacedByUserId: userId,
            label: `pre-replace ${new Date().toISOString()}`,
          },
        });

        await tx.municipality.update({
          where: { id: municipality.id },
          data:
            input.kind === "land"
              ? { boundaryGeojson: newGeojson, landBoundaryManual: true }
              : { waterGeojson: newGeojson, waterBoundaryManual: true },
        });
      });

      // 4. Regenerate the official AreaBoundary overlay so the new shape
      // renders on both maps.
      await importOfficialBoundaries(prisma, tenantId, userId);

      // 5. Fan out area re-derivation for every Event/Patrol/FuelEntry in the
      // tenant — the municipality geometry universe changed, so previously
      // derived areaBoundaryId assignments may now be stale. Reuses the same
      // helper as areaBoundary.rebuild.
      const fanOut = await fanOutAreaRederive(tenantId, userId);

      // 5b. Fan out municipality re-attribution — the boundary (land OR
      // water) that determines which municipality a point/track falls
      // inside just changed, so previously-derived `municipalityId`
      // assignments on Event/Patrol rows may now be wrong (this is what
      // was missing before — only areaBoundaryId was recomputed).
      const municipalityFanOut = await fanOutMunicipalityReassign(tenantId, userId);

      // 6. Audit.
      await prisma.auditLog.create({
        data: {
          action: "MUNICIPALITY_BOUNDARY_REPLACE",
          userId,
          tenantId,
          entityType: "Municipality",
          entityId: municipality.id,
          changesJson: {
            municipalityId: municipality.id,
            municipalitySlug: municipality.slug,
            kind: input.kind,
            vertexCount: normalized.vertexCount,
            municipalityReassignJobs: municipalityFanOut.enqueued,
          },
        },
      });

      return {
        municipalityName: municipality.name,
        kind: input.kind,
        enqueuedJobs: fanOut.enqueued,
        municipalityReassignJobs: municipalityFanOut.enqueued,
      };
    }),

  // List the most recent boundary-geometry snapshots for a municipality, so
  // an admin can pick one to revert to. Does not return the geojson blob —
  // callers fetch that only when actually reverting.
  listBoundarySnapshots: matrixProcedure(adminProcedure, "patrol-areas", "view")
    .input(
      z
        .object({
          municipalityId: z.string().cuid(),
          kind: z.enum(["land", "water"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx;

      const municipality = await prisma.municipality.findFirst({
        where: { id: input.municipalityId, tenantId },
        select: { id: true },
      });
      if (!municipality) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Boundary not found." });
      }

      const snapshots = await prisma.municipalityBoundarySnapshot.findMany({
        where: {
          tenantId,
          municipalityId: input.municipalityId,
          ...(input.kind ? { kind: input.kind } : {}),
        },
        select: {
          id: true,
          kind: true,
          label: true,
          createdAt: true,
          replacedByUserId: true,
          previousGeojson: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const userIds = [
        ...new Set(
          snapshots
            .map((s) => s.replacedByUserId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          })
        : [];
      const userNameById = new Map(users.map((u) => [u.id, u.fullName]));

      return snapshots.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        createdAt: s.createdAt,
        replacedByName:
          s.replacedByUserId !== null
            ? (userNameById.get(s.replacedByUserId) ?? null)
            : null,
        hasGeometry: s.previousGeojson !== null,
      }));
    }),

  // Revert a municipality's land/water geometry to a chosen snapshot's
  // previousGeojson. Snapshots the CURRENT geometry first (so the revert
  // itself is reversible), then swaps in the prior geometry, then
  // regenerates the official overlay + re-derives areas — same pipeline as
  // replaceBoundaryGeometry.
  revertBoundaryGeometry: matrixProcedure(adminProcedure, "patrol-areas", "update")
    .input(
      z
        .object({
          snapshotId: z.string().cuid(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;

      const snapshot = await prisma.municipalityBoundarySnapshot.findFirst({
        where: { id: input.snapshotId, tenantId },
      });
      if (!snapshot) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found." });
      }

      const municipality = await prisma.municipality.findFirst({
        where: { id: snapshot.municipalityId, tenantId },
        select: { id: true, name: true, slug: true, boundaryGeojson: true, waterGeojson: true },
      });
      if (!municipality) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Boundary not found." });
      }

      const kind = snapshot.kind as "land" | "water";

      if (kind === "land" && snapshot.previousGeojson === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No prior land geometry to revert to.",
        });
      }

      await prisma.$transaction(async (tx) => {
        // 1. Snapshot the CURRENT geometry before overwriting it, so this
        // revert is itself reversible.
        const currentGeojson =
          kind === "land" ? municipality.boundaryGeojson : municipality.waterGeojson;

        await tx.municipalityBoundarySnapshot.create({
          data: {
            tenantId,
            municipalityId: municipality.id,
            kind,
            ...(currentGeojson !== null
              ? { previousGeojson: currentGeojson as object }
              : {}),
            replacedByUserId: userId,
            label: `pre-revert ${new Date().toISOString()}`,
          },
        });

        // 2. Restore the snapshot's prior geometry. A Json? column is set to
        // NULL via Prisma.JsonNull (a plain JS `null` is ambiguous with
        // "field not provided" for Json fields).
        await tx.municipality.update({
          where: { id: municipality.id },
          data:
            kind === "land"
              ? { boundaryGeojson: snapshot.previousGeojson as object }
              : {
                  waterGeojson:
                    snapshot.previousGeojson === null
                      ? Prisma.JsonNull
                      : (snapshot.previousGeojson as object),
                },
        });
      });

      // 3. Regenerate the official AreaBoundary overlay so the restored
      // shape renders on both maps.
      await importOfficialBoundaries(prisma, tenantId, userId);

      // 4. Fan out area re-derivation — the municipality geometry universe
      // changed, so previously derived areaBoundaryId assignments may now be
      // stale. Reuses the same helper as replaceBoundaryGeometry.
      const fanOut = await fanOutAreaRederive(tenantId, userId);

      // 4b. Fan out municipality re-attribution — same reasoning as
      // replaceBoundaryGeometry: the restored boundary changes which
      // municipality a point/track falls inside.
      const municipalityFanOut = await fanOutMunicipalityReassign(tenantId, userId);

      // 5. Audit.
      await prisma.auditLog.create({
        data: {
          action: "MUNICIPALITY_BOUNDARY_REVERT",
          userId,
          tenantId,
          entityType: "Municipality",
          entityId: municipality.id,
          changesJson: {
            municipalityId: municipality.id,
            municipalitySlug: municipality.slug,
            kind,
            snapshotId: snapshot.id,
            municipalityReassignJobs: municipalityFanOut.enqueued,
          },
        },
      });

      return {
        municipalityName: municipality.name,
        kind,
        enqueuedJobs: fanOut.enqueued,
        municipalityReassignJobs: municipalityFanOut.enqueued,
      };
    }),
});
