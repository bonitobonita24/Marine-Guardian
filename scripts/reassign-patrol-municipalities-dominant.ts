/**
 * reassign-patrol-municipalities-dominant.ts
 *
 * One-shot backfill script. Re-assigns municipalityId for ALL existing
 * non-deleted patrols using the dominant-track-location logic
 * (assignMunicipalityToDominantTrack) instead of the old start-point-only
 * logic — so a patrol that starts in one municipality but ranges mostly
 * into another gets correctly attributed to the municipality where most of
 * its GPS track falls.
 *
 * Usage (from monorepo root):
 *   DATABASE_URL=... npx tsx scripts/reassign-patrol-municipalities-dominant.ts
 *   DATABASE_URL=... npx tsx scripts/reassign-patrol-municipalities-dominant.ts --tenant <tenantId>
 *
 * Or with the dev env:
 *   source .env.dev && npx tsx scripts/reassign-patrol-municipalities-dominant.ts
 *
 * Safe to re-run (idempotent): only writes municipalityId + municipalityAssignedAt
 * when the computed value differs from what's currently stored.
 *
 * Reuses the SAME shared assignMunicipalityToDominantTrack function as the
 * live municipality-assign.processor.ts patrol path, so this script and the
 * BullMQ job can never diverge in logic.
 */

import { PrismaClient } from "@prisma/client";
import {
  assignMunicipalityToDominantTrackByContainment,
  assignMunicipalityByContainment,
} from "../packages/shared/src/lib/municipality-assignment/index.js";

const prisma = new PrismaClient();

const tenantIdx = process.argv.indexOf("--tenant");
const TENANT_ID = tenantIdx !== -1 ? process.argv[tenantIdx + 1] : undefined;

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: TENANT_ID ? { id: TENANT_ID } : {},
    select: { id: true, slug: true },
  });
  console.log(`[reassign-patrol-municipalities-dominant] ${String(tenants.length)} tenant(s) found.`);

  for (const tenant of tenants) {
    console.log(`\n[reassign-patrol-municipalities-dominant] Tenant: ${tenant.slug}`);

    const municipalities = await prisma.municipality.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, slug: true, name: true, boundaryGeojson: true },
    });

    if (municipalities.length === 0) {
      console.log("  ⚠ No municipalities seeded — run seed first.");
      continue;
    }

    console.log(`  ${String(municipalities.length)} municipalities`);

    const patrols = await prisma.patrol.findMany({
      where: { tenantId: tenant.id, isDeleted: false },
      select: {
        id: true,
        municipalityId: true,
        startLocationLat: true,
        startLocationLon: true,
        track: { select: { trackGeojson: true } },
      },
    });

    console.log(`  Patrols to evaluate: ${String(patrols.length)}`);

    const now = new Date();
    let updated = 0;
    let unchanged = 0;
    let skippedNoLocation = 0;

    for (const patrol of patrols) {
      const trackGeojson = patrol.track?.trackGeojson ?? null;
      const hasStartLocation =
        patrol.startLocationLat != null && patrol.startLocationLon != null;

      if (!hasStartLocation && trackGeojson == null) {
        skippedNoLocation++;
        continue;
      }

      // Boundaries-only (governing principle): track → dominant containment;
      // no track but a start point → start-point containment; else null. No
      // nearest fallback — a wholly-offshore patrol stays UNATTRIBUTED.
      const municipalityId =
        trackGeojson != null
          ? assignMunicipalityToDominantTrackByContainment(trackGeojson, municipalities)
          : assignMunicipalityByContainment(
              {
                lat: patrol.startLocationLat as number,
                lon: patrol.startLocationLon as number,
              },
              municipalities,
            );

      if (municipalityId === patrol.municipalityId) {
        unchanged++;
        continue;
      }

      await prisma.patrol.update({
        where: { id: patrol.id },
        data: { municipalityId, municipalityAssignedAt: now },
      });
      updated++;
    }

    console.log(
      `  Patrols: ${String(updated)} updated, ${String(unchanged)} unchanged, ${String(skippedNoLocation)} skipped (no location/track)`,
    );
  }

  console.log("\n[reassign-patrol-municipalities-dominant] Done.");
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
