/**
 * backfill-patrol-track-materialization.ts
 *
 * ⚠ CALLS THE LIVE EarthRanger API (1 GET per patrol) — unlike
 * backfill-patrol-computed-metrics.ts which works entirely from the local DB.
 * Run with --dry-run first to see how many patrols would be processed.
 * Use --limit to throttle the number of API calls per invocation.
 *
 * Purpose: materialize PatrolTrack rows for patrols that have raw patrol_segments
 * in the DB but no PatrolTrack yet — closing the "no track → no distance" gap
 * (e.g. the ~235 June-2026 patrols with 0% materialization coverage).
 *
 * Usage (from monorepo root):
 *   DATABASE_URL=... npx tsx scripts/backfill-patrol-track-materialization.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/backfill-patrol-track-materialization.ts --limit 5
 *   DATABASE_URL=... npx tsx scripts/backfill-patrol-track-materialization.ts --limit 50
 *
 * Safe to re-run: only touches patrols where track IS NULL and segments exist.
 * Each successful materialization also enables downstream distance recompute
 * (run backfill-patrol-computed-metrics.ts afterwards to pick those up).
 */

import { PrismaClient } from "@prisma/client";
import { materializePatrolTrack } from "../packages/jobs/src/lib/patrol-track-materialization.js";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT =
  limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1] ?? "0", 10) : Infinity;

async function main() {
  console.log(
    `[backfill-patrol-track-materialization] Starting. DRY_RUN=${String(DRY_RUN)}, LIMIT=${String(LIMIT)}`,
  );

  const patrols = await prisma.patrol.findMany({
    where: {
      isDeleted: false,
      segments: { some: {} },
      track: { is: null },
    },
    select: { id: true, tenantId: true, state: true },
    orderBy: { startTime: "asc" },
  });

  console.log(
    `[backfill-patrol-track-materialization] ${String(patrols.length)} patrol(s) eligible (have segments, no track).`,
  );

  if (LIMIT !== Infinity && !isNaN(LIMIT)) {
    console.log(
      `[backfill-patrol-track-materialization] --limit ${String(LIMIT)} — will stop after ${String(LIMIT)} processed.`,
    );
  }

  let processed = 0;
  let errors = 0;
  const skipReasons = new Map<string, number>();

  for (const patrol of patrols) {
    if (processed >= LIMIT) {
      console.log(
        `[backfill-patrol-track-materialization] Reached --limit ${String(LIMIT)}. Stopping.`,
      );
      break;
    }

    if (DRY_RUN) {
      console.log(
        `  [dry-run] Would materialize patrol ${patrol.id} (state=${patrol.state})`,
      );
      processed++;
      continue;
    }

    try {
      const result = await materializePatrolTrack(
        prisma as unknown as Parameters<typeof materializePatrolTrack>[0],
        patrol.id,
      );

      if (result.skipped) {
        const reason = result.skipReason ?? "unknown";
        skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
        console.log(`  [skip] ${patrol.id} — ${reason}`);
      } else {
        processed++;
        console.log(`  [ok]   ${patrol.id} — ${String(result.pointCount)} pts`);
      }
    } catch (err) {
      errors++;
      console.error(`  [error] ${patrol.id} —`, err);
    }
  }

  const totalSkipped = [...skipReasons.values()].reduce((a, b) => a + b, 0);

  const skipBreakdown =
    skipReasons.size > 0
      ? "\n" +
        [...skipReasons.entries()]
          .map(([reason, count]) => `    ${reason}: ${String(count)}`)
          .join("\n")
      : " (none)";

  console.log(
    `\n[backfill-patrol-track-materialization] Done.` +
      `  processed=${String(processed)}  skipped=${String(totalSkipped)}  errors=${String(errors)}` +
      `\n  skip breakdown:${skipBreakdown}`,
  );

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[backfill-patrol-track-materialization] Fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
