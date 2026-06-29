/**
 * Verify importOfficialBoundaries against the dev DB for the demo-site tenant.
 * Run: packages/db/node_modules/.bin/tsx scripts/verify-import-official-boundaries.ts
 */
import { prisma } from "@marine-guardian/db";
import { importOfficialBoundaries } from "../apps/web/src/server/boundaries/import-official-boundaries";

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: "demo-site" },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("demo-site tenant not found");
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  if (!user) throw new Error("no user for demo-site tenant");

  console.log("Running importOfficialBoundaries for tenant", tenant.slug);
  const res = await importOfficialBoundaries(prisma, tenant.id, user.id);
  console.log("RESULT:", res);

  // Idempotency: a second run must produce 0 created, same total.
  const res2 = await importOfficialBoundaries(prisma, tenant.id, user.id);
  console.log("RE-RUN (expect created:0):", res2);

  const official = await prisma.areaBoundary.findMany({
    where: { tenantId: tenant.id, source: "official" },
    select: { name: true, region: true, arcgisReferenceId: true, geometryGeojson: true },
    orderBy: { arcgisReferenceId: "asc" },
  });
  console.log("OFFICIAL COUNT:", official.length);
  for (const b of official) {
    const g = b.geometryGeojson as { type?: string } | null;
    console.log(`  ${b.arcgisReferenceId}  | ${b.name} | ${b.region} | geom=${g?.type}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
