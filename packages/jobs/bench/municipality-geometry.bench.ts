/**
 * municipality-geometry.bench.ts
 *
 * ┌─ WHAT THIS IS ─────────────────────────────────────────────────────────┐
 * │ A DEV-ONLY MEASUREMENT TOOL. It is NOT part of the test suite — vitest │
 * │ does not pick it up (`bench/` is outside `src/`), CI never runs it,    │
 * │ and it asserts nothing. It exists to produce NUMBERS.                  │
 * │                                                                        │
 * │ WHAT IT MEASURES: the real per-patrol wall-clock cost of the           │
 * │ municipality-assignment geometry hot path (classifyTrackTerrain +      │
 * │ assignMunicipalityToDominantTrackByContainment) against REAL dev data, │
 * │ reported as p50/p95/max plus the track-point distribution that drives  │
 * │ it.                                                                    │
 * │                                                                        │
 * │ HOW TO RUN (from monorepo root, dev DB must be up):                    │
 * │   source .env.dev && npx tsx \                                         │
 * │     packages/jobs/bench/municipality-geometry.bench.ts                 │
 * │   ... --limit 200      (patrol sample size, default 200)               │
 * │                                                                        │
 * │ READ-ONLY: never writes to the database.                               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS IS KEPT: the municipality-assign lock-duration incident (2026-07)
 * established that this queue's own completed/failed counters LIE when jobs
 * lose their lock and silently re-run — so queue metrics cannot tell you what
 * a job actually costs. Only direct measurement can. Keeping this harness
 * means the next person tuning lockDuration or touching the geometry does not
 * have to re-derive the measurement setup from scratch.
 *
 * Read-only benchmark for the municipality-assignment
 * geometry hot path (classifyTrackTerrain / classifyPointTerrain).
 *
 * WHY: municipality-assign jobs were measured at ~4 minutes each on staging,
 * blowing past BullMQ's 30s default lockDuration — every long job lost its
 * lock, was re-run from the start, and made the queue's completed/failed
 * counters meaningless. This harness measures the real per-patrol cost and
 * proves any optimization is output-identical against real dev data.
 *
 * Usage (from monorepo root):
 *   source .env.dev && npx tsx scripts/bench-municipality-geometry.ts
 *   ... --limit 200         (patrol sample size, default 200)
 *
 * READ-ONLY: never writes to the database.
 */

import { PrismaClient } from "@prisma/client";
import {
  classifyTrackTerrain,
  assignMunicipalityToDominantTrackByContainment,
} from "@marine-guardian/shared/lib/municipality-assignment";

const prisma = new PrismaClient();

const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : 200;

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] as number;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  console.log(`tenants: ${tenants.map((t) => t.slug).join(", ")}`);

  for (const tenant of tenants) {
    const municipalities = await prisma.municipality.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, boundaryGeojson: true, waterGeojson: true },
    });
    if (municipalities.length === 0) continue;

    const withWater = municipalities.filter((m) => m.waterGeojson != null).length;
    console.log(
      `\n=== tenant ${tenant.slug}: ${String(municipalities.length)} municipalities (${String(withWater)} with waterGeojson) ===`,
    );

    const tracks = await prisma.patrolTrack.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, patrolId: true, trackGeojson: true },
      take: LIMIT,
      orderBy: { id: "asc" },
    });
    console.log(`patrol tracks sampled: ${String(tracks.length)}`);
    if (tracks.length === 0) continue;

    // Point-count distribution — the real driver of per-job cost.
    const pointCounts: number[] = [];
    const perTrackMs: number[] = [];
    let totalMs = 0;

    for (const track of tracks) {
      const t0 = performance.now();
      classifyTrackTerrain(track.trackGeojson, municipalities);
      assignMunicipalityToDominantTrackByContainment(track.trackGeojson, municipalities);
      const dt = performance.now() - t0;
      perTrackMs.push(dt);
      totalMs += dt;

      // count points cheaply for reporting
      const g = track.trackGeojson as { features?: { geometry?: { coordinates?: unknown[] } }[] };
      const n = Array.isArray(g?.features)
        ? g.features.reduce(
            (acc, f) => acc + (Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.length : 0),
            0,
          )
        : 0;
      pointCounts.push(n);
    }

    const sortedMs = [...perTrackMs].sort((a, b) => a - b);
    const sortedPts = [...pointCounts].sort((a, b) => a - b);

    console.log(`track points  — p50 ${String(pct(sortedPts, 50))}  p95 ${String(pct(sortedPts, 95))}  max ${String(sortedPts[sortedPts.length - 1])}`);
    console.log(
      `geometry ms   — p50 ${pct(sortedMs, 50).toFixed(1)}  p95 ${pct(sortedMs, 95).toFixed(1)}  max ${(sortedMs[sortedMs.length - 1] ?? 0).toFixed(1)}`,
    );
    console.log(`total ${(totalMs / 1000).toFixed(1)}s over ${String(tracks.length)} tracks (mean ${(totalMs / tracks.length).toFixed(1)}ms)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e: unknown) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
