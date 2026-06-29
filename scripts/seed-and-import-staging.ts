/**
 * seed-and-import-staging.ts
 *
 * One-shot staging provisioner for the municipality-boundaries feature:
 *   1. seedMunicipalities(prisma) — upsert 16 munis + 2 MPAs (+ derived waters)
 *      for every tenant (idempotent, additive).
 *   2. importOfficialBoundaries(prisma, tenantId, userId) — create the
 *      AreaBoundary source=official display records (idempotent) for every
 *      tenant that has a user.
 *
 * Reads DATABASE_URL from env (point it at the staging SSH tunnel before run).
 * Run: packages/db/node_modules/.bin/tsx scripts/seed-and-import-staging.ts
 */
import { prisma } from "@marine-guardian/db";
import { seedMunicipalities } from "../packages/db/prisma/seed-municipalities";
import { importOfficialBoundaries } from "../apps/web/src/server/boundaries/import-official-boundaries";

async function main() {
  console.log("[1/2] seedMunicipalities…");
  await seedMunicipalities(prisma);

  console.log("[2/2] importOfficialBoundaries per tenant…");
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const tenant of tenants) {
    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    if (!user) {
      console.log(`  ${tenant.slug}: no user → skip import`);
      continue;
    }
    const res = await importOfficialBoundaries(prisma, tenant.id, user.id);
    console.log(`  ${tenant.slug}:`, res);
  }

  const total = await prisma.areaBoundary.count({ where: { source: "official" } });
  const munis = await prisma.municipality.count();
  const zones = await prisma.protectedZone.count();
  console.log(`DONE. municipalities=${munis} protected_zones=${zones} area_boundaries(official)=${total}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
