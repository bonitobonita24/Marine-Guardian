/**
 * load-municipal-waters.ts
 *
 * Push the regenerated non-overlapping median-line water polygons
 * (apps/web/src/data/coverage/water/<slug>.water.geojson, produced by
 * derive-municipal-waters.ts) into Municipality.water_geojson for every tenant,
 * SNAPSHOTTING the prior geometry into MunicipalityBoundarySnapshot (kind="water")
 * first so the change is reversible.
 *
 * Run: source .env.dev && ./packages/db/node_modules/.bin/tsx scripts/load-municipal-waters.ts
 *      (optional: --tenant <tenantId>)
 *
 * Idempotent: re-running snapshots the then-current geometry and re-writes it.
 * Does NOT touch land (boundaryGeojson) or any other field.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { MUNICIPALITIES } from "../apps/web/src/data/coverage/coverage-areas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WATER_DIR = path.join(__dirname, "..", "apps", "web", "src", "data", "coverage", "water");
const LABEL = "median-line regen 2026-07-13 (non-overlapping, RA 7160/RA 8550)";

const tenantIdx = process.argv.indexOf("--tenant");
const TENANT_ID = tenantIdx !== -1 ? process.argv[tenantIdx + 1] : undefined;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: TENANT_ID ? { id: TENANT_ID } : {},
    select: { id: true, slug: true },
  });
  console.log(`[load-municipal-waters] ${String(tenants.length)} tenant(s).`);

  // Preload the regenerated water geometry per slug once.
  const waterBySlug = new Map<string, unknown>();
  for (const entry of MUNICIPALITIES) {
    const file = path.join(WATER_DIR, `${entry.id}.water.geojson`);
    if (!fs.existsSync(file)) {
      console.log(`  ⚠ missing ${entry.id}.water.geojson — skipping`);
      continue;
    }
    waterBySlug.set(entry.id, JSON.parse(fs.readFileSync(file, "utf8")));
  }

  for (const tenant of tenants) {
    console.log(`\n[load-municipal-waters] Tenant: ${tenant.slug}`);
    const munis = await prisma.municipality.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, slug: true, name: true, waterGeojson: true },
    });

    let updated = 0;
    let missing = 0;
    for (const muni of munis) {
      const newWater = waterBySlug.get(muni.slug);
      if (newWater == null) {
        missing++;
        continue;
      }
      await prisma.$transaction([
        prisma.municipalityBoundarySnapshot.create({
          data: {
            tenantId: tenant.id,
            municipalityId: muni.id,
            kind: "water",
            previousGeojson: (muni.waterGeojson ?? undefined) as never,
            label: LABEL,
          },
        }),
        prisma.municipality.update({
          where: { id: muni.id },
          data: { waterGeojson: newWater as never },
        }),
      ]);
      updated++;
    }
    console.log(`  ${updated} water polygons replaced (snapshotted), ${missing} without a regenerated file.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
