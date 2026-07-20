/**
 * municipality-equivalence.bench.ts
 *
 * ┌─ WHAT THIS IS ─────────────────────────────────────────────────────────┐
 * │ A DEV-ONLY MEASUREMENT + PROOF TOOL. It is NOT part of the test suite  │
 * │ — vitest does not pick it up (`bench/` is outside `src/`) and CI never │
 * │ runs it. It is run BY HAND, before shipping a change to the           │
 * │ municipality-assignment geometry.                                      │
 * │                                                                        │
 * │ WHAT IT MEASURES: runs a BASELINE implementation and the CURRENT one   │
 * │ over the SAME real dev patrol tracks + event coordinates and asserts   │
 * │ byte-identical output for every input, reporting a mismatch count and  │
 * │ the before/after speedup. Non-zero mismatches ⇒ exit code 1.           │
 * │                                                                        │
 * │ HOW TO RUN (from monorepo root, dev DB must be up):                    │
 * │   1. Extract the baseline you are comparing against, e.g.:             │
 * │      git show <ref>:packages/shared/src/lib/municipality-assignment/\  │
 * │        index.ts > packages/shared/src/lib/municipality-assignment/\    │
 * │        __baseline__.ts                                                 │
 * │   2. source .env.dev && npx tsx \                                      │
 * │        packages/jobs/bench/municipality-equivalence.bench.ts           │
 * │      ... --limit 400   (patrol sample size, default 400)               │
 * │   3. DELETE __baseline__.ts when done — a second copy of this          │
 * │      implementation sitting in the tree is a real hazard (someone      │
 * │      will eventually import the wrong one).                            │
 * │                                                                        │
 * │ Expect a LONG runtime (tens of minutes): the baseline is slow by       │
 * │ definition — that is the point of the comparison.                      │
 * │                                                                        │
 * │ READ-ONLY: never writes to the database.                               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS IS KEPT: this geometry ATTRIBUTES REAL RECORDS — it has already
 * re-attributed staging and is queued to re-attribute production. A change
 * that is 10x faster and 0.01% different is worse than no change at all, and
 * "the unit tests still pass" does not prove equivalence over real-world
 * coordinate distributions. Any future optimization here must clear this
 * harness first.
 *
 * EQUIVALENCE PROOF + before/after timing for the municipality-assignment
 * geometry optimization (bbox pre-filter, existence-only water test, early
 * exit, memoized unwrap, exact-coordinate dedup).
 *
 * Runs the HEAD baseline implementation (`__baseline__.ts`) and the optimized
 * implementation (`index.ts`) over the SAME real dev patrol tracks and events,
 * and asserts identical output for every input. Any single mismatch fails the
 * run — the optimization must be output-identical, because this geometry
 * re-attributes staging and production data.
 *
 * Usage (from monorepo root):
 *   source .env.dev && npx tsx packages/jobs/bench/municipality-equivalence.bench.ts
 *   ... --limit 400
 *
 * READ-ONLY: never writes to the database.
 */

import { PrismaClient } from "@prisma/client";
import * as OLD from "../../shared/src/lib/municipality-assignment/__baseline__.js";
import * as NEW from "@marine-guardian/shared/lib/municipality-assignment";

const prisma = new PrismaClient();

const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : 400;

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] as number;
}

let mismatches = 0;
function compare(label: string, id: string, a: unknown, b: unknown): void {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) {
    mismatches++;
    if (mismatches <= 20) {
      console.error(`  MISMATCH ${label} [${id}]: old=${sa} new=${sb}`);
    }
  }
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: "ph" },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error("tenant 'ph' not found");

  const municipalities = await prisma.municipality.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, boundaryGeojson: true, waterGeojson: true },
  });
  const zones = await prisma.protectedZone.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, boundaryGeojson: true },
  });
  console.log(
    `tenant ${tenant.slug}: ${String(municipalities.length)} municipalities, ${String(zones.length)} protected zones`,
  );

  const tracks = await prisma.patrolTrack.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, trackGeojson: true },
    take: LIMIT,
    orderBy: { id: "asc" },
  });
  console.log(`patrol tracks sampled: ${String(tracks.length)}`);

  let oldTotal = 0;
  let newTotal = 0;
  const oldMs: number[] = [];
  const newMs: number[] = [];
  let totalPoints = 0;

  for (const track of tracks) {
    const g = track.trackGeojson as { features?: { geometry?: { coordinates?: unknown[] } }[] };
    totalPoints += Array.isArray(g?.features)
      ? g.features.reduce(
          (acc, f) => acc + (Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.length : 0),
          0,
        )
      : 0;

    const t0 = performance.now();
    const oldTerrain = OLD.classifyTrackTerrain(track.trackGeojson, municipalities);
    const oldDominant = OLD.assignMunicipalityToDominantTrackByContainment(track.trackGeojson, municipalities);
    const oldZones = OLD.assignZonesToTrack(track.trackGeojson, zones);
    const dtOld = performance.now() - t0;
    oldMs.push(dtOld);
    oldTotal += dtOld;

    const t1 = performance.now();
    const newTerrain = NEW.classifyTrackTerrain(track.trackGeojson, municipalities);
    const newDominant = NEW.assignMunicipalityToDominantTrackByContainment(track.trackGeojson, municipalities);
    const newZones = NEW.assignZonesToTrack(track.trackGeojson, zones);
    const dtNew = performance.now() - t1;
    newMs.push(dtNew);
    newTotal += dtNew;

    compare("classifyTrackTerrain", track.id, oldTerrain, newTerrain);
    compare("dominantTrackByContainment", track.id, oldDominant, newDominant);
    compare("assignZonesToTrack", track.id, oldZones, newZones);
    compare("firstTrackPoint", track.id, OLD.firstTrackPoint(track.trackGeojson), NEW.firstTrackPoint(track.trackGeojson));
  }

  // Track-phase verdict is printed HERE, before the event phase runs, so that
  // a failure later in this script can never destroy the track evidence (it
  // did exactly that once: a bad column name crashed the event query and the
  // whole track result was lost).
  {
    const so = [...oldMs].sort((a, b) => a - b);
    const sn = [...newMs].sort((a, b) => a - b);
    console.log(`\n--- TRACK PHASE (${String(tracks.length)} patrols, ${String(totalPoints)} points) ---`);
    console.log(`OLD  total ${(oldTotal / 1000).toFixed(1)}s  mean ${(oldTotal / tracks.length).toFixed(1)}ms  p50 ${pct(so, 50).toFixed(1)}  p95 ${pct(so, 95).toFixed(1)}  max ${(so[so.length - 1] ?? 0).toFixed(1)}`);
    console.log(`NEW  total ${(newTotal / 1000).toFixed(1)}s  mean ${(newTotal / tracks.length).toFixed(1)}ms  p50 ${pct(sn, 50).toFixed(1)}  p95 ${pct(sn, 95).toFixed(1)}  max ${(sn[sn.length - 1] ?? 0).toFixed(1)}`);
    console.log(`speedup ${(oldTotal / newTotal).toFixed(1)}x  ·  track-phase mismatches: ${String(mismatches)}`);
  }

  // Per-POINT equivalence across every real event coordinate — exercises the
  // attribution paths (land containment, water equidistance tie-break, capped
  // nearest) that the track path only reaches indirectly.
  const events = await prisma.event.findMany({
    where: { tenantId: tenant.id, locationLat: { not: null }, locationLon: { not: null } },
    select: { id: true, locationLat: true, locationLon: true },
    take: 5000,
    orderBy: { id: "asc" },
  });
  console.log(`event points sampled: ${String(events.length)}`);

  for (const ev of events) {
    const p = { lat: Number(ev.locationLat), lon: Number(ev.locationLon) };
    compare("assignMunicipalityByContainment", ev.id, OLD.assignMunicipalityByContainment(p, municipalities), NEW.assignMunicipalityByContainment(p, municipalities));
    compare("classifyPointTerrain", ev.id, OLD.classifyPointTerrain(p, municipalities), NEW.classifyPointTerrain(p, municipalities));
    compare("assignMunicipalityToPoint", ev.id, OLD.assignMunicipalityToPoint(p, municipalities), NEW.assignMunicipalityToPoint(p, municipalities));
    compare("assignMunicipalityToPointOrNearest", ev.id, OLD.assignMunicipalityToPointOrNearest(p, municipalities), NEW.assignMunicipalityToPointOrNearest(p, municipalities));
    compare("nearestMunicipality", ev.id, OLD.nearestMunicipality(p, municipalities), NEW.nearestMunicipality(p, municipalities));
    compare("assignZonesToPoint", ev.id, OLD.assignZonesToPoint(p, zones), NEW.assignZonesToPoint(p, zones));
    compare("isPointInAnyGeometry", ev.id, OLD.isPointInAnyGeometry(p, municipalities.map((m) => m.boundaryGeojson)), NEW.isPointInAnyGeometry(p, municipalities.map((m) => m.boundaryGeojson)));
  }

  const so = [...oldMs].sort((a, b) => a - b);
  const sn = [...newMs].sort((a, b) => a - b);
  console.log(`\ntotal track points processed: ${String(totalPoints)}`);
  console.log(`OLD  total ${(oldTotal / 1000).toFixed(1)}s  mean ${(oldTotal / tracks.length).toFixed(1)}ms  p50 ${pct(so, 50).toFixed(1)}  p95 ${pct(so, 95).toFixed(1)}  max ${(so[so.length - 1] ?? 0).toFixed(1)}`);
  console.log(`NEW  total ${(newTotal / 1000).toFixed(1)}s  mean ${(newTotal / tracks.length).toFixed(1)}ms  p50 ${pct(sn, 50).toFixed(1)}  p95 ${pct(sn, 95).toFixed(1)}  max ${(sn[sn.length - 1] ?? 0).toFixed(1)}`);
  console.log(`speedup ${(oldTotal / newTotal).toFixed(1)}x`);

  console.log(`\n${mismatches === 0 ? "EQUIVALENCE PASS — 0 mismatches" : `EQUIVALENCE FAIL — ${String(mismatches)} mismatches`}`);
  if (mismatches > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch((e: unknown) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
