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
import { Prisma } from "@prisma/client";

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
  /** Derived municipal-water polygon file (municipalities only). */
  waterFile: string | null;
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

  // MIRROR of apps/web/src/data/coverage/coverage-areas.ts (the canonical source).
  // Kept in owner's province-grouped order (2026-06-29). If you edit the registry
  // there, update this list too (cross-package import is avoided so packages/db
  // typecheck stays self-contained). waterFile = derived 15 km municipal-water.
  const municipalities: CoverageEntry[] = [
    // ── Oriental Mindoro ──
    { id: "calapan-city",  name: "Calapan City",  province: "Oriental Mindoro",   psgcCode: "175104000", type: "municipality", geojsonFile: "calapan-city.geojson",  waterFile: "water/calapan-city.water.geojson",  parentMunicipalityId: null },
    { id: "baco",          name: "Baco",          province: "Oriental Mindoro",   psgcCode: "175101000", type: "municipality", geojsonFile: "baco.geojson",          waterFile: "water/baco.water.geojson",          parentMunicipalityId: null },
    { id: "san-teodoro",   name: "San Teodoro",   province: "Oriental Mindoro",   psgcCode: "175110000", type: "municipality", geojsonFile: "san-teodoro.geojson",   waterFile: "water/san-teodoro.water.geojson",   parentMunicipalityId: null },
    { id: "puerto-galera", name: "Puerto Galera", province: "Oriental Mindoro",   psgcCode: "175109000", type: "municipality", geojsonFile: "puerto-galera.geojson", waterFile: "water/puerto-galera.water.geojson", parentMunicipalityId: null },
    // ── Occidental Mindoro ──
    { id: "abra-de-ilog",  name: "Abra de Ilog",  province: "Occidental Mindoro", psgcCode: "174901000", type: "municipality", geojsonFile: "abra-de-ilog.geojson",  waterFile: "water/abra-de-ilog.water.geojson",  parentMunicipalityId: null },
    { id: "mamburao",      name: "Mamburao",      province: "Occidental Mindoro", psgcCode: null,        type: "municipality", geojsonFile: "mamburao.geojson",      waterFile: "water/mamburao.water.geojson",      parentMunicipalityId: null },
    { id: "santa-cruz",    name: "Santa Cruz",    province: "Occidental Mindoro", psgcCode: null,        type: "municipality", geojsonFile: "santa-cruz.geojson",    waterFile: "water/santa-cruz.water.geojson",    parentMunicipalityId: null },
    { id: "sablayan",      name: "Sablayan",      province: "Occidental Mindoro", psgcCode: "174909000", type: "municipality", geojsonFile: "sablayan.geojson",      waterFile: "water/sablayan.water.geojson",      parentMunicipalityId: null },
    { id: "calintaan",     name: "Calintaan",     province: "Occidental Mindoro", psgcCode: null,        type: "municipality", geojsonFile: "calintaan.geojson",     waterFile: "water/calintaan.water.geojson",     parentMunicipalityId: null },
    // ── Palawan ──
    { id: "araceli",       name: "Araceli",       province: "Palawan",            psgcCode: "175302000", type: "municipality", geojsonFile: "araceli.geojson",       waterFile: "water/araceli.water.geojson",       parentMunicipalityId: null },
    { id: "roxas-palawan", name: "Roxas",         province: "Palawan",            psgcCode: "175319000", type: "municipality", geojsonFile: "roxas-palawan.geojson", waterFile: "water/roxas-palawan.water.geojson", parentMunicipalityId: null },
    { id: "dumaran",       name: "Dumaran",       province: "Palawan",            psgcCode: "175306000", type: "municipality", geojsonFile: "dumaran.geojson",       waterFile: "water/dumaran.water.geojson",       parentMunicipalityId: null },
    { id: "el-nido",       name: "El Nido",       province: "Palawan",            psgcCode: null,        type: "municipality", geojsonFile: "el-nido.geojson",       waterFile: "water/el-nido.water.geojson",       parentMunicipalityId: null },
    { id: "taytay",        name: "Taytay",        province: "Palawan",            psgcCode: "175322000", type: "municipality", geojsonFile: "taytay.geojson",        waterFile: "water/taytay.water.geojson",        parentMunicipalityId: null },
    { id: "aborlan",       name: "Aborlan",       province: "Palawan",            psgcCode: "175301000", type: "municipality", geojsonFile: "aborlan.geojson",       waterFile: "water/aborlan.water.geojson",       parentMunicipalityId: null },
    { id: "narra",         name: "Narra",         province: "Palawan",            psgcCode: null,        type: "municipality", geojsonFile: "narra.geojson",         waterFile: "water/narra.water.geojson",         parentMunicipalityId: null },
  ];

  const zones: CoverageEntry[] = [
    { id: "apo-reef-natural-park", name: "Apo Reef Natural Park",         province: "Occidental Mindoro", psgcCode: null, type: "protected-zone", geojsonFile: "apo-reef-natural-park.geojson", waterFile: null, parentMunicipalityId: "sablayan" },
    { id: "harka-piloto-mpa",      name: "Harka Piloto Fish Sanctuary",   province: "Oriental Mindoro",   psgcCode: null, type: "protected-zone", geojsonFile: "harka-piloto-mpa.geojson",      waterFile: null, parentMunicipalityId: "calapan-city" },
  ];

  return { municipalities, zones };
}

function readGeojson(filename: string): Prisma.InputJsonValue {
  const path = resolve(COVERAGE_DIR, filename);
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as Prisma.InputJsonValue;
}

/** Read a geojson that may not exist (e.g. a municipality with no derived water). */
function readGeojsonOptional(filename: string | null): Prisma.InputJsonValue | undefined {
  if (!filename) return undefined;
  try {
    return readGeojson(filename);
  } catch {
    return undefined; // file missing → leave waterGeojson null
  }
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
      const water = readGeojsonOptional(m.waterFile);
      const row = await prisma.municipality.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: m.id } },
        create: {
          tenantId: tenant.id,
          slug: m.id,
          name: m.name,
          province: m.province,
          psgcCode: m.psgcCode,
          boundaryGeojson: geojson,
          ...(water !== undefined ? { waterGeojson: water } : {}),
        },
        update: {
          name: m.name,
          province: m.province,
          psgcCode: m.psgcCode,
          boundaryGeojson: geojson,
          ...(water !== undefined ? { waterGeojson: water } : {}),
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
          boundaryGeojson: geojson,
          parentMunicipalityId,
        },
        update: {
          name: z.name,
          boundaryGeojson: geojson,
          parentMunicipalityId,
        },
        select: { id: true, slug: true },
      });
      console.log(`    ✓ ProtectedZone ${z.name} (${row.id})`);
    }
  }

  console.log("[seed-municipalities] Done.");
}
