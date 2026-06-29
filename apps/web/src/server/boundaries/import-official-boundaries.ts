/**
 * import-official-boundaries.ts
 *
 * "One source feeds both" (owner decision 2026-06-29): official coverage
 * boundaries are MANAGED as AreaBoundary rows (source=official) so they live
 * in the Patrol Areas surface and render on both maps — rather than being
 * hardcoded in the UI. This importer is the trusted-import step: it reads the
 * already-seeded geometry from the Municipality + ProtectedZone tables (the
 * provenance/seed source loaded from data/coverage in A4) and upserts a set of
 * official AreaBoundary records for the tenant.
 *
 * WHY DB→DB (not fs/bundled geojson): the Municipality.boundaryGeojson /
 * .waterGeojson and ProtectedZone.boundaryGeojson columns already hold the
 * exact geometry per tenant. Reading from the DB keeps the importer free of
 * runtime filesystem access (the dev app runs as a Next standalone image with
 * no source bind-mount) and free of multi-MB bundled data modules.
 *
 * Records produced per tenant (~34 for the current registry):
 *   - municipality LAND   → arcgisReferenceId "official:<slug>:land"
 *   - municipality WATERS → arcgisReferenceId "official:<slug>:water"
 *   - protected zone (MPA)→ arcgisReferenceId "official:mpa:<slug>"
 *
 * Idempotent: there is no unique constraint on (tenantId, arcgisReferenceId),
 * so we find-first by ref + tenant then update-or-create. Re-running refreshes
 * geometry/name in place — never duplicates.
 *
 * NOTE — no area re-derivation fan-out here. This import is about DISPLAY
 * geometry. Re-assigning every Event/Patrol to an AreaBoundary is the separate,
 * heavy concern handled by areaBoundary.rebuild; an admin can run that
 * explicitly when they want re-derivation. Keeping import fast avoids enqueuing
 * tens of thousands of rederive jobs on every button press.
 */

import type { Prisma, ExtendedPrismaClient } from "@marine-guardian/db";

export interface ImportOfficialResult {
  created: number;
  updated: number;
  total: number;
}

type GeoJsonLike = Record<string, unknown>;

/**
 * Normalize a stored coverage GeoJSON value (FeatureCollection | Feature | bare
 * geometry) down to the bare geometry object the map's MapPolygon renders.
 * The coverage files are stored as single-feature FeatureCollections; this also
 * tolerates a Feature or a bare geometry for robustness. Returns null when no
 * usable geometry can be extracted.
 */
export function extractGeometry(input: unknown): GeoJsonLike | null {
  if (input == null || typeof input !== "object") return null;
  const obj = input as GeoJsonLike;
  switch (obj.type) {
    case "FeatureCollection": {
      const features = obj.features;
      if (Array.isArray(features) && features.length > 0) {
        return extractGeometry(features[0]);
      }
      return null;
    }
    case "Feature":
      return extractGeometry(obj.geometry);
    case "Polygon":
    case "MultiPolygon":
    case "LineString":
    case "MultiLineString":
      return obj;
    default:
      return null;
  }
}

interface BoundaryPlan {
  refKey: string;
  name: string;
  region: string;
  geometry: GeoJsonLike;
}

/**
 * Upsert official AreaBoundary records for a tenant from its seeded
 * Municipality + ProtectedZone geometry. Returns counts of created vs updated.
 */
export async function importOfficialBoundaries(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  userId: string,
): Promise<ImportOfficialResult> {
  const [municipalities, zones] = await Promise.all([
    prisma.municipality.findMany({
      where: { tenantId },
      select: {
        slug: true,
        name: true,
        province: true,
        boundaryGeojson: true,
        waterGeojson: true,
      },
    }),
    prisma.protectedZone.findMany({
      where: { tenantId },
      select: {
        slug: true,
        name: true,
        boundaryGeojson: true,
        parentMunicipality: { select: { province: true } },
      },
    }),
  ]);

  const plans: BoundaryPlan[] = [];

  for (const m of municipalities) {
    const land = extractGeometry(m.boundaryGeojson);
    if (land) {
      plans.push({
        refKey: `official:${m.slug}:land`,
        name: `${m.name} — Municipal Land`,
        region: m.province,
        geometry: land,
      });
    }
    const water = extractGeometry(m.waterGeojson);
    if (water) {
      plans.push({
        refKey: `official:${m.slug}:water`,
        name: `${m.name} — Municipal Waters`,
        region: m.province,
        geometry: water,
      });
    }
  }

  for (const z of zones) {
    const geometry = extractGeometry(z.boundaryGeojson);
    if (geometry) {
      plans.push({
        refKey: `official:mpa:${z.slug}`,
        name: z.name,
        region: z.parentMunicipality?.province ?? "Protected Zone",
        geometry,
      });
    }
  }

  let created = 0;
  let updated = 0;

  for (const plan of plans) {
    const geometryGeojson = plan.geometry as Prisma.InputJsonValue;
    const existing = await prisma.areaBoundary.findFirst({
      where: { tenantId, arcgisReferenceId: plan.refKey },
      select: { id: true },
    });
    if (existing) {
      await prisma.areaBoundary.update({
        where: { id: existing.id },
        data: {
          name: plan.name,
          region: plan.region,
          source: "official",
          geometryType: "Polygon",
          geometryGeojson,
          isEnabled: true,
        },
      });
      updated += 1;
    } else {
      await prisma.areaBoundary.create({
        data: {
          tenantId,
          name: plan.name,
          aliases: [],
          region: plan.region,
          source: "official",
          geometryType: "Polygon",
          geometryGeojson,
          isEnabled: true,
          overrideOfficial: false,
          arcgisReferenceId: plan.refKey,
          createdByUserId: userId,
        },
      });
      created += 1;
    }
  }

  return { created, updated, total: plans.length };
}
