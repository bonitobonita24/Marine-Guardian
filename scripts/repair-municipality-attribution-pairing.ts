#!/usr/bin/env tsx
/**
 * repair-municipality-attribution-pairing.ts
 *
 * Repairs rows where municipality VALUE and municipality PROVENANCE came apart,
 * then validates the CHECK constraint that makes the split impossible again
 * (migration 20260721020000_enforce_municipality_attribution_pairing).
 *
 * ⚠ THIS IS NOT LIVE PIPELINE LOGIC.
 *   Like scripts/backfill-municipality-attribution.ts, this is a repair driver.
 *   The live path (`municipality-assign.processor.ts`) is untouched and already
 *   writes both columns in the same statement. Do not port anything here into
 *   the processor.
 *
 * WHAT WENT WRONG (dev, 2026-07-20)
 *   34 events carried `municipality_id` with a NULL
 *   `municipality_attribution_method`; 1 patrol carried the inverse (method
 *   `title_hint`, no municipality).
 *
 *   There was no second writer and no disagreement about the VALUE. The rows
 *   were written by a worker container running an image built minutes BEFORE
 *   825cf6c, whose update payload had no method key at all -- it set the value
 *   and left the provenance behind. Re-running containment reproduced the
 *   stored municipality exactly for all 34 events, and correctly reproduced
 *   "unattributed" for the patrol.
 *
 * THE TWO DRIFT DIRECTIONS AND THEIR HONEST REPAIRS
 *
 *   A. value without provenance  (municipality_id SET, method NULL)
 *      Recompute containment over the row's own point. If it reproduces the
 *      STORED municipality, the value provably came from containment and the
 *      method is stamped `containment`. This is a derivation, not a guess.
 *
 *      If it does NOT reproduce the stored municipality, the row is REPORTED
 *      and LEFT ALONE. A disagreement about the value is a correctness
 *      question -- possibly an older `nearest`-era write, possibly moved
 *      boundary geometry -- and it needs a decision, not a silent overwrite.
 *
 *   B. provenance without value  (municipality_id NULL, method SET)
 *      A NULL municipality cannot carry a claim about how it was derived, so
 *      the stale method is cleared. `manual` is the one exception: a manual
 *      method with no municipality would mean an officer's override was half
 *      erased, which this script will not paper over -- it reports instead.
 *
 * POINT SELECTION mirrors the processor exactly:
 *   events  -> location_lat / location_lon
 *   patrols -> start_location_lat / start_location_lon, falling back to the
 *              FIRST coordinate of the materialised track (start-point
 *              governing rule, owner 2026-07-15). No point is ever invented.
 *
 * USAGE
 *   scripts/repair-municipality-attribution-pairing.ts --dry-run   (default)
 *   scripts/repair-municipality-attribution-pairing.ts --execute
 *   scripts/repair-municipality-attribution-pairing.ts --execute --verbose
 *
 * On --execute the script re-asserts the drift predicate inside each UPDATE's
 * WHERE clause, so a row that a concurrent writer already fixed is counted as
 * raced rather than clobbered. When it finishes with zero remaining drift it
 * runs `ALTER TABLE ... VALIDATE CONSTRAINT`, promoting the NOT VALID
 * constraint to fully validated for that environment.
 */

import { platformPrisma } from "@marine-guardian/db";
import {
  assignMunicipalityByContainment,
  firstTrackPoint,
} from "@marine-guardian/shared/lib/municipality-assignment";

const TAG = "[repair-attribution-pairing]";

const args = process.argv.slice(2);
const isExecute = args.includes("--execute");
const isDryRun = !isExecute;
const verbose = args.includes("--verbose");

interface Counters {
  candidates: number;
  stampedContainment: number;
  clearedStaleMethod: number;
  noPoint: number;
  valueDisagreement: number;
  manualWithoutValue: number;
  raced: number;
}

function emptyCounters(): Counters {
  return {
    candidates: 0,
    stampedContainment: 0,
    clearedStaleMethod: 0,
    noPoint: 0,
    valueDisagreement: 0,
    manualWithoutValue: 0,
    raced: 0,
  };
}

type MunicipalityRow = {
  id: string;
  slug: string;
  name: string;
  boundaryGeojson: unknown;
  waterGeojson: unknown;
};

async function loadMunicipalitiesByTenant(): Promise<Map<string, MunicipalityRow[]>> {
  const rows = await platformPrisma.municipality.findMany({
    select: {
      id: true,
      tenantId: true,
      slug: true,
      name: true,
      boundaryGeojson: true,
      waterGeojson: true,
    },
  });
  const byTenant = new Map<string, MunicipalityRow[]>();
  for (const r of rows) {
    const list = byTenant.get(r.tenantId) ?? [];
    list.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      boundaryGeojson: r.boundaryGeojson,
      waterGeojson: r.waterGeojson,
    });
    byTenant.set(r.tenantId, list);
  }
  return byTenant;
}

// ── Direction A: value without provenance ────────────────────────────────────

async function repairEventsMissingMethod(
  muniByTenant: Map<string, MunicipalityRow[]>,
): Promise<Counters> {
  const c = emptyCounters();

  const rows = await platformPrisma.event.findMany({
    where: { municipalityId: { not: null }, municipalityAttributionMethod: null },
    select: {
      id: true,
      tenantId: true,
      locationLat: true,
      locationLon: true,
      municipalityId: true,
    },
  });

  for (const row of rows) {
    c.candidates++;

    if (row.locationLat == null || row.locationLon == null) {
      // A municipality with no coordinates to justify it cannot be re-derived.
      c.noPoint++;
      if (verbose) console.log(`${TAG}   NO POINT event ${row.id} — left for review`);
      continue;
    }

    const munis = muniByTenant.get(row.tenantId) ?? [];
    const recomputed = assignMunicipalityByContainment(
      { lat: row.locationLat, lon: row.locationLon },
      munis,
    );

    if (recomputed !== row.municipalityId) {
      c.valueDisagreement++;
      const storedName = munis.find((m) => m.id === row.municipalityId)?.name ?? row.municipalityId;
      const gotName = munis.find((m) => m.id === recomputed)?.name ?? String(recomputed);
      console.log(
        `${TAG}   ⚠ VALUE DISAGREEMENT event ${row.id}: stored=${storedName} recomputed=${gotName} — NOT touched`,
      );
      continue;
    }

    if (verbose) {
      const nm = munis.find((m) => m.id === row.municipalityId)?.name ?? row.municipalityId;
      console.log(`${TAG}   ${isDryRun ? "WOULD STAMP" : "STAMP"} event ${row.id} → containment (${nm})`);
    }

    if (!isDryRun) {
      const res = await platformPrisma.event.updateMany({
        // Re-assert the drift predicate: only stamp a row that is STILL
        // value-without-provenance and still holds the value we verified.
        where: {
          id: row.id,
          municipalityId: row.municipalityId,
          municipalityAttributionMethod: null,
        },
        data: { municipalityAttributionMethod: "containment" },
      });
      if (res.count === 0) {
        c.raced++;
        continue;
      }
    }
    c.stampedContainment++;
  }

  return c;
}

async function repairPatrolsMissingMethod(
  muniByTenant: Map<string, MunicipalityRow[]>,
): Promise<Counters> {
  const c = emptyCounters();

  const rows = await platformPrisma.patrol.findMany({
    where: { municipalityId: { not: null }, municipalityAttributionMethod: null },
    select: {
      id: true,
      tenantId: true,
      startLocationLat: true,
      startLocationLon: true,
      municipalityId: true,
      municipalityManual: true,
      track: { select: { trackGeojson: true } },
    },
  });

  for (const row of rows) {
    c.candidates++;

    // A manually-overridden patrol's value did not come from geometry, so
    // containment cannot certify it. `manual` is the honest provenance.
    if (row.municipalityManual) {
      if (verbose) console.log(`${TAG}   ${isDryRun ? "WOULD STAMP" : "STAMP"} patrol ${row.id} → manual`);
      if (!isDryRun) {
        const res = await platformPrisma.patrol.updateMany({
          where: {
            id: row.id,
            municipalityId: row.municipalityId,
            municipalityAttributionMethod: null,
            municipalityManual: true,
          },
          data: { municipalityAttributionMethod: "manual" },
        });
        if (res.count === 0) {
          c.raced++;
          continue;
        }
      }
      c.stampedContainment++;
      continue;
    }

    const hasStart = row.startLocationLat != null && row.startLocationLon != null;
    const startPoint = hasStart
      ? { lat: row.startLocationLat as number, lon: row.startLocationLon as number }
      : firstTrackPoint(row.track?.trackGeojson ?? null);

    if (startPoint == null) {
      c.noPoint++;
      if (verbose) console.log(`${TAG}   NO POINT patrol ${row.id} — left for review`);
      continue;
    }

    const munis = muniByTenant.get(row.tenantId) ?? [];
    const recomputed = assignMunicipalityByContainment(startPoint, munis);

    if (recomputed !== row.municipalityId) {
      c.valueDisagreement++;
      const storedName = munis.find((m) => m.id === row.municipalityId)?.name ?? row.municipalityId;
      const gotName = munis.find((m) => m.id === recomputed)?.name ?? String(recomputed);
      console.log(
        `${TAG}   ⚠ VALUE DISAGREEMENT patrol ${row.id}: stored=${storedName} recomputed=${gotName} — NOT touched`,
      );
      continue;
    }

    if (verbose) {
      const nm = munis.find((m) => m.id === row.municipalityId)?.name ?? row.municipalityId;
      console.log(`${TAG}   ${isDryRun ? "WOULD STAMP" : "STAMP"} patrol ${row.id} → containment (${nm})`);
    }

    if (!isDryRun) {
      const res = await platformPrisma.patrol.updateMany({
        where: {
          id: row.id,
          municipalityId: row.municipalityId,
          municipalityAttributionMethod: null,
        },
        data: { municipalityAttributionMethod: "containment" },
      });
      if (res.count === 0) {
        c.raced++;
        continue;
      }
    }
    c.stampedContainment++;
  }

  return c;
}

// ── Direction B: provenance without value ────────────────────────────────────

async function clearOrphanMethods(entity: "event" | "patrol"): Promise<Counters> {
  const c = emptyCounters();

  const rows =
    entity === "event"
      ? await platformPrisma.event.findMany({
          where: { municipalityId: null, municipalityAttributionMethod: { not: null } },
          select: { id: true, municipalityAttributionMethod: true },
        })
      : await platformPrisma.patrol.findMany({
          where: { municipalityId: null, municipalityAttributionMethod: { not: null } },
          select: { id: true, municipalityAttributionMethod: true },
        });

  for (const row of rows) {
    c.candidates++;

    // A manual method with no municipality means an officer's override was
    // half erased. Clearing it would destroy the only remaining trace.
    if (row.municipalityAttributionMethod === "manual") {
      c.manualWithoutValue++;
      console.log(
        `${TAG}   ⚠ MANUAL WITHOUT VALUE ${entity} ${row.id} — NOT touched, needs a human decision`,
      );
      continue;
    }

    if (verbose) {
      console.log(
        `${TAG}   ${isDryRun ? "WOULD CLEAR" : "CLEAR"} ${entity} ${row.id} — stale ` +
          `${row.municipalityAttributionMethod} on an unattributed row`,
      );
    }

    if (!isDryRun) {
      const where = {
        id: row.id,
        municipalityId: null,
        municipalityAttributionMethod: row.municipalityAttributionMethod,
      };
      const res =
        entity === "event"
          ? await platformPrisma.event.updateMany({
              where,
              data: { municipalityAttributionMethod: null },
            })
          : await platformPrisma.patrol.updateMany({
              where,
              data: { municipalityAttributionMethod: null },
            });
      if (res.count === 0) {
        c.raced++;
        continue;
      }
    }
    c.clearedStaleMethod++;
  }

  return c;
}

// ── Constraint validation ────────────────────────────────────────────────────

/**
 * Promote the NOT VALID CHECK constraints to fully validated.
 *
 * Only safe once the table is provably clean -- VALIDATE CONSTRAINT scans every
 * row and throws if any still violates the pairing. That throw is the point: it
 * is the loud confirmation that the repair really finished.
 */
async function validateConstraints(): Promise<void> {
  for (const [table, constraint] of [
    ["events", "events_municipality_attribution_paired"],
    ["patrols", "patrols_municipality_attribution_paired"],
  ] as const) {
    await platformPrisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}"`,
    );
    console.log(`${TAG}   ✅ VALIDATED ${constraint}`);
  }
}

// ── Reporting ────────────────────────────────────────────────────────────────

function report(label: string, c: Counters): void {
  console.log(`${TAG} ${label}`);
  console.log(`${TAG}   candidates                     : ${c.candidates}`);
  console.log(`${TAG}   stamped (value → provenance)   : ${c.stampedContainment}`);
  console.log(`${TAG}   cleared (orphan provenance)    : ${c.clearedStaleMethod}`);
  console.log(`${TAG}   no point (left for review)     : ${c.noPoint}`);
  console.log(`${TAG}   value disagreement (untouched) : ${c.valueDisagreement}`);
  console.log(`${TAG}   manual w/o value (untouched)   : ${c.manualWithoutValue}`);
  console.log(`${TAG}   raced                          : ${c.raced}`);
}

function totals(list: Counters[]): Counters {
  return list.reduce((acc, c) => {
    acc.candidates += c.candidates;
    acc.stampedContainment += c.stampedContainment;
    acc.clearedStaleMethod += c.clearedStaleMethod;
    acc.noPoint += c.noPoint;
    acc.valueDisagreement += c.valueDisagreement;
    acc.manualWithoutValue += c.manualWithoutValue;
    acc.raced += c.raced;
    return acc;
  }, emptyCounters());
}

async function main(): Promise<void> {
  console.log(`${TAG} mode: ${isDryRun ? "DRY RUN (no writes)" : "EXECUTE"}`);

  const muniByTenant = await loadMunicipalitiesByTenant();

  const eventsA = await repairEventsMissingMethod(muniByTenant);
  const patrolsA = await repairPatrolsMissingMethod(muniByTenant);
  const eventsB = await clearOrphanMethods("event");
  const patrolsB = await clearOrphanMethods("patrol");

  console.log("");
  report("events  — value without provenance", eventsA);
  report("patrols — value without provenance", patrolsA);
  report("events  — provenance without value", eventsB);
  report("patrols — provenance without value", patrolsB);

  const all = totals([eventsA, patrolsA, eventsB, patrolsB]);
  const unresolved = all.noPoint + all.valueDisagreement + all.manualWithoutValue;

  console.log("");
  if (isDryRun) {
    console.log(`${TAG} DRY RUN complete — re-run with --execute to apply.`);
    return;
  }

  if (unresolved > 0) {
    console.log(
      `${TAG} ${unresolved} row(s) still violate the pairing and were deliberately NOT ` +
        `auto-fixed. Constraint NOT validated — resolve them, then re-run.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`${TAG} zero remaining drift — validating constraints…`);
  await validateConstraints();
  console.log(`${TAG} done.`);
}

main()
  .catch((err) => {
    console.error(`${TAG} FAILED`, err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await platformPrisma.$disconnect();
  });
