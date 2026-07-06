/**
 * reassign-event-municipalities-nearest.ts
 *
 * One-shot backfill script. Re-assigns municipalityId for ALL existing
 * non-deleted events using the nearest-municipality fallback
 * (assignMunicipalityToPointOrNearest) instead of the old capped
 * containment-or-within-15km logic (assignMunicipalityToPoint) — so an
 * event sitting further offshore than the ~15 km municipal-waters reach
 * still gets attributed to the nearest coastal municipality, instead of
 * being left with municipalityId = null. This is what makes the
 * Region/Municipality Coverage chart (which only counts municipality-assigned
 * rows) reconcile with the raw Events tile (which counts everything in range).
 *
 * Usage (from monorepo root):
 *   DATABASE_URL=... npx tsx scripts/reassign-event-municipalities-nearest.ts
 *   DATABASE_URL=... npx tsx scripts/reassign-event-municipalities-nearest.ts --tenant <tenantId>
 *
 * Or with the dev env:
 *   source .env.dev && npx tsx scripts/reassign-event-municipalities-nearest.ts
 *
 * Safe to re-run (idempotent): only writes municipalityId + municipalityAssignedAt
 * when the computed value differs from what's currently stored.
 *
 * Reuses the SAME shared assignMunicipalityToPointOrNearest function as the
 * live municipality-assign.processor.ts event path, so this script and the
 * BullMQ job can never diverge in logic. Modeled on
 * reassign-patrol-municipalities-dominant.ts.
 */

import { PrismaClient } from "@prisma/client";
import { assignMunicipalityToPointOrNearest } from "../packages/shared/src/lib/municipality-assignment/index.js";

const prisma = new PrismaClient();

const tenantIdx = process.argv.indexOf("--tenant");
const TENANT_ID = tenantIdx !== -1 ? process.argv[tenantIdx + 1] : undefined;

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: TENANT_ID ? { id: TENANT_ID } : {},
    select: { id: true, slug: true },
  });
  console.log(`[reassign-event-municipalities-nearest] ${String(tenants.length)} tenant(s) found.`);

  for (const tenant of tenants) {
    console.log(`\n[reassign-event-municipalities-nearest] Tenant: ${tenant.slug}`);

    const municipalities = await prisma.municipality.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, slug: true, name: true, boundaryGeojson: true },
    });

    if (municipalities.length === 0) {
      console.log("  ⚠ No municipalities seeded — run seed first.");
      continue;
    }

    console.log(`  ${String(municipalities.length)} municipalities`);

    const events = await prisma.event.findMany({
      where: { tenantId: tenant.id, isDeleted: false },
      select: {
        id: true,
        municipalityId: true,
        locationLat: true,
        locationLon: true,
      },
    });

    console.log(`  Events to evaluate: ${String(events.length)}`);

    const now = new Date();
    let updated = 0;
    let unchanged = 0;
    let skippedNoLocation = 0;

    for (const event of events) {
      const hasLocation = event.locationLat != null && event.locationLon != null;

      if (!hasLocation) {
        skippedNoLocation++;
        continue;
      }

      const point = { lat: event.locationLat as number, lon: event.locationLon as number };
      const municipalityId = assignMunicipalityToPointOrNearest(point, municipalities);

      if (municipalityId === event.municipalityId) {
        unchanged++;
        continue;
      }

      await prisma.event.update({
        where: { id: event.id },
        data: { municipalityId, municipalityAssignedAt: now },
      });
      updated++;
    }

    console.log(
      `  Events: ${String(updated)} updated, ${String(unchanged)} unchanged, ${String(skippedNoLocation)} skipped (no location)`,
    );
  }

  console.log("\n[reassign-event-municipalities-nearest] Done.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
