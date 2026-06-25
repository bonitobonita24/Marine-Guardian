/**
 * backfill-patrol-computed-metrics.ts
 *
 * Idempotent backfill: calls recomputeDistanceAndDuration for every closed
 * patrol that already has a PatrolTrack row but a null computedDistanceKm.
 *
 * This plugs the P2-B gap: historic/backfilled patrols were loaded directly
 * into the DB (bypassing the 5.2b BullMQ processor that normally triggers
 * recomputeDistanceAndDuration after track materialisation), so their
 * computed_distance_km / computed_duration_hours columns stayed null —
 * causing "—" in the Coverage PDF KMS/Duration columns and on the dashboard.
 *
 * Usage (from monorepo root):
 *   DATABASE_URL=... npx tsx scripts/backfill-patrol-computed-metrics.ts
 *
 * Safe to re-run: only touches patrols where computedDistanceKm IS NULL and
 * a PatrolTrack row already exists. Patrols without a PatrolTrack are skipped
 * (no track data → nothing to compute). Pass --force to recompute ALL patrols
 * that have a track, regardless of whether computedDistanceKm is already set.
 *
 * Never removes or truncates data. Never calls the EarthRanger API.
 */

import { PrismaClient } from "@prisma/client";
import { recomputeDistanceAndDuration } from "../packages/jobs/src/lib/patrol-track-materialization.js";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(
    `[backfill-patrol-computed-metrics] Starting. FORCE=${String(FORCE)}, DRY_RUN=${String(DRY_RUN)}`,
  );

  // Find all patrol IDs that have a PatrolTrack but null computedDistanceKm.
  // FORCE mode: include patrols already computed (re-run all with a track).
  const patrols = await prisma.patrol.findMany({
    where: {
      isDeleted: false,
      track: { isNot: null },
      ...(FORCE ? {} : { computedDistanceKm: null }),
    },
    select: { id: true, tenantId: true, state: true },
    orderBy: { startTime: "asc" },
  });

  console.log(`[backfill-patrol-computed-metrics] ${String(patrols.length)} patrol(s) to process.`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let totalDistanceKm = 0;

  for (const patrol of patrols) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would recompute patrol ${patrol.id} (state=${patrol.state})`);
      processed++;
      continue;
    }

    try {
      const result = await recomputeDistanceAndDuration(
        // recomputeDistanceAndDuration accepts a PrismaClientLike; the real
        // PrismaClient satisfies the interface structurally (it exposes the
        // same .patrolTrack.findUnique / .patrol.update shape).
        prisma as unknown as Parameters<typeof recomputeDistanceAndDuration>[0],
        patrol.id,
      );

      if (result.pointCount === 0) {
        // No track points → nothing computed; skip is fine, track exists but
        // may be an empty FeatureCollection from ER.
        skipped++;
        console.log(
          `  [skip] ${patrol.id} — zero track points (empty GeoJSON).`,
        );
      } else {
        processed++;
        totalDistanceKm += result.computedDistanceKm;
        console.log(
          `  [ok]   ${patrol.id} — ${result.computedDistanceKm.toFixed(2)} km, ` +
          `${result.computedDurationHours.toFixed(2)} h, ${String(result.pointCount)} pts`,
        );
      }
    } catch (err) {
      errors++;
      console.error(`  [error] ${patrol.id} —`, err);
    }
  }

  console.log(
    `\n[backfill-patrol-computed-metrics] Done.` +
    `  processed=${String(processed)}  skipped=${String(skipped)}  errors=${String(errors)}` +
    `  totalDistanceKm=${totalDistanceKm.toFixed(2)}`,
  );

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[backfill-patrol-computed-metrics] Fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
