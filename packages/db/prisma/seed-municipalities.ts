/**
 * seed-municipalities.ts
 *
 * Upserts Municipality + ProtectedZone rows for every tenant that exists in
 * the database. Called from seed.ts after the tenant row is guaranteed present.
 *
 * GeoJSON files are read from apps/web/src/data/coverage/ relative to the
 * monorepo root (two levels up from packages/db/).
 *
 * Idempotent: safe to run multiple times. New entries are added; existing
 * rows have their boundaryGeojson + province updated on re-seed.
 *
 * The function accepts a Prisma client instance so seed.ts can pass its own
 * (already-instantiated) client and share the transaction context.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve from packages/db/prisma/ → monorepo root → apps/web/src/data/coverage/
const COVERAGE_DIR = resolve(
  __dirname,
  "../../../apps/web/src/data/coverage",
);

interface CoverageEntry {
  id: string;
  name: string;
  province: string;
  psgcCode: string | null;
  type: "municipality" | "protected-zone";
  geojsonFile: string;
  parentMunicipalityId: string | null;
}

/** Read the coverage-areas.ts module as a JS-compatible JSON-like structure. */
function loadCoverageAreas(): { municipalities: CoverageEntry[]; zones: CoverageEntry[] } {
  // We cannot `import` a .ts file from a non-TS context at runtime without tsx.
  // Since this file itself is run via tsx (packages/db/scripts/db:seed → tsx prisma/seed.ts),
  // we CAN do a dynamic import. However, to keep it simple and avoid circular
  // resolution issues, we hardcode the known entries here — they change infrequently
  // and the coverage-areas.ts file is the canonical source for the UI.
  //
  // If a new municipality is added to coverage-areas.ts, add it here too.
  // The GeoJSON file path is read from COVERAGE_DIR at seed time.

  const municipalities: CoverageEntry[] = [
    { id: "calapan-city",   name: "Calapan City",   province: "Oriental Mindoro",  psgcCode: "175104000", type: "municipality", geojsonFile: "calapan-city.geojson",    parentMunicipalityId: null },
    { id: "baco",            name: "Baco",            province: "Oriental Mindoro",  psgcCode: "175101000", type: "municipality", geojsonFile: "baco.geojson",             parentMunicipalityId: null },
    { id: "san-teodoro",     name: "San Teodoro",     province: "Oriental Mindoro",  psgcCode: "175110000", type: "municipality", geojsonFile: "san-teodoro.geojson",      parentMunicipalityId: null },
    { id: "puerto-galera",   name: "Puerto Galera",   province: "Oriental Mindoro",  psgcCode: "175109000", type: "municipality", geojsonFile: "puerto-galera.geojson",    parentMunicipalityId: null },
    { id: "abra-de-ilog",    name: "Abra de Ilog",    province: "Occidental Mindoro",psgcCode: "174901000", type: "municipality", geojsonFile: "abra-de-ilog.geojson",     parentMunicipalityId: null },
    { id: "sablayan",        name: "Sablayan",        province: "Occidental Mindoro",psgcCode: "174909000", type: "municipality", geojsonFile: "sablayan.geojson",         parentMunicipalityId: null },
    { id: "roxas-palawan",   name: "Roxas",           province: "Palawan",           psgcCode: "175319000", type: "municipality", geojsonFile: "roxas-palawan.geojson",    parentMunicipalityId: null },
    { id: "araceli",         name: "Araceli",         province: "Palawan",           psgcCode: "175302000", type: "municipality", geojsonFile: "araceli.geojson",          parentMunicipalityId: null },
    { id: "dumaran",         name: "Dumaran",         province: "Palawan",           psgcCode: "175306000", type: "municipality", geojsonFile: "dumaran.geojson",          parentMunicipalityId: null },
    { id: "taytay",          name: "Taytay",          province: "Palawan",           psgcCode: "175322000", type: "municipality", geojsonFile: "taytay.geojson",           parentMunicipalityId: null },
    { id: "aborlan",         name: "Aborlan",         province: "Palawan",           psgcCode: "175301000", type: "municipality", geojsonFile: "aborlan.geojson",          parentMunicipalityId: null },
  ];

  const zones: CoverageEntry[] = [
    { id: "apo-reef-natural-park", name: "Apo Reef Natural Park", province: "Occidental Mindoro", psgcCode: null, type: "protected-zone", geojsonFile: "apo-reef-natural-park.geojson", parentMunicipalityId: "sablayan" },
  ];

  return { municipalities, zones };
}

function readGeojson(filename: string): unknown {
  const path = resolve(COVERAGE_DIR, filename);
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as unknown;
}

export async function seedMunicipalities(prisma: PrismaClient): Promise<void> {
  const { municipalities, zones } = loadCoverageAreas();

  // Operate on every existing tenant (usually just "demo-site" in dev).
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  console.log(`[seed-municipalities] Seeding for ${String(tenants.length)} tenant(s)…`);

  for (const tenant of tenants) {
    console.log(`  Tenant: ${tenant.slug}`);

    // Upsert municipalities first (protected zones reference them).
    const muniIdBySlug = new Map<string, string>();

    for (const m of municipalities) {
      const geojson = readGeojson(m.geojsonFile);
      const row = await prisma.municipality.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: m.id } },
        create: {
          tenantId: tenant.id,
          slug: m.id,
          name: m.name,
          province: m.province,
          psgcCode: m.psgcCode,
          boundaryGeojson: geojson as Parameters<typeof prisma.municipality.upsert>[0]["create"]["boundaryGeojson"],
        },
        update: {
          name: m.name,
          province: m.province,
          psgcCode: m.psgcCode,
          boundaryGeojson: geojson as Parameters<typeof prisma.municipality.upsert>[0]["update"]["boundaryGeojson"],
        },
        select: { id: true, slug: true },
      });
      muniIdBySlug.set(m.id, row.id);
      console.log(`    ✓ Municipality ${m.name} (${row.id})`);
    }

    // Upsert protected zones with parent municipality FK resolved.
    for (const z of zones) {
      const geojson = readGeojson(z.geojsonFile);
      const parentMunicipalityId = z.parentMunicipalityId
        ? (muniIdBySlug.get(z.parentMunicipalityId) ?? null)
        : null;

      const row = await prisma.protectedZone.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: z.id } },
        create: {
          tenantId: tenant.id,
          slug: z.id,
          name: z.name,
          boundaryGeojson: geojson as Parameters<typeof prisma.protectedZone.upsert>[0]["create"]["boundaryGeojson"],
          parentMunicipalityId,
        },
        update: {
          name: z.name,
          boundaryGeojson: geojson as Parameters<typeof prisma.protectedZone.upsert>[0]["update"]["boundaryGeojson"],
          parentMunicipalityId,
        },
        select: { id: true, slug: true },
      });
      console.log(`    ✓ ProtectedZone ${z.name} (${row.id})`);
    }
  }

  console.log("[seed-municipalities] Done.");
}
