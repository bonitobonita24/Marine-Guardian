#!/usr/bin/env tsx
/**
 * backfill-municipality-attribution.ts
 *
 * ONE-TIME HISTORICAL CLEANUP of the unattributed municipality backlog.
 *
 * ⚠ THIS IS NOT LIVE PIPELINE LOGIC — AND MUST NEVER BECOME IT ⚠
 *   `municipality-assign.processor.ts` is deliberately UNTOUCHED by this work.
 *   The boundary-only governing rule still stands for everyday behaviour: a
 *   record whose geometry cannot attribute it stays UNATTRIBUTED, and a
 *   Command Center officer assigns it by hand via the existing Override
 *   dialog.  The title-hint and nearest stages below exist solely to clear the
 *   EXISTING backlog once.  Do not port them into the processor, and do not
 *   add a "fallback" to the live path.
 *
 * RESOLUTION ORDER (backlog only)
 *   containment (already done by the live processor)
 *     → whitelisted whole-token title hint   (PATROLS ONLY)
 *     → 45 km nearest                        (patrols AND events)
 *     → UNATTRIBUTED
 *
 * WHY EVENTS GET NO TITLE HINTS
 *   Event titles carry 12 distinct values across 5,139 rows and half are NULL
 *   — zero signal.  The description path reaches only 6% coverage at 82.8%
 *   accuracy, below the acceptance threshold.  Events therefore skip straight
 *   to the nearest stage.  Do not add event title hints.
 *
 * TITLE HINTS — whole-token matching, measured against 4,597 labelled patrols
 *   The whitelist and its exclusions live in
 *   `@marine-guardian/shared/lib/municipality-attribution`.  Every accepted
 *   hint measured >= 97% on the geometry-attributed validation set; the gate
 *   (exactly ONE distinct municipality implied, whitelisted hint only, title
 *   at least 5 characters) measured 98.4% overall.
 *
 *   Whole-token matching is load-bearing: naive substring matching would
 *   mis-attribute roughly 2,000 records ("Nestor" → st, "STATION" → st,
 *   "Calacalsag" → cal, "Mamerto" → mam).
 *
 * NEAREST — 45 km cap, measured to the LAND polygon
 *   45 km sits in an empty band: the main mass of real distances ends at
 *   43 km, exactly one record sits at 45 km, and every bin from 46 to 53 km is
 *   empty.  Apo Reef patrols lie 30.07–41.43 km out and win Sablayan
 *   unanimously.  Distance is measured to `boundaryGeojson` (LAND), never
 *   `waterGeojson` — deliberate for this backfill.
 *
 *   Near-ties (runner-up within max(2 km, 10% of the winner)) are attributed
 *   to the CLOSEST municipality AND flagged `municipality_attribution_ambiguous
 *   = true`, so the ambiguity is reviewable rather than silently resolved.
 *
 *   Garbage coordinates (24 events at exactly lat=0/lon=0, three patrols in
 *   Marseille, two in Indonesia) are rejected by an EXPLICIT guard in
 *   `nearestWithinCap`, not merely by the cap — they must stay unattributed at
 *   any cap.
 *
 * MANUAL WINS — a human's assignment is never overwritten
 *   Rows with `municipality_attribution_method = 'manual'` are NEVER touched.
 *   This is enforced in the SQL itself, not merely in application code:
 *     • the candidate SELECT filters the method out; and
 *     • the UPDATE re-asserts it in its WHERE clause, so a concurrent write
 *       that flips a row to manual between SELECT and UPDATE loses the race
 *       safely (0 rows matched, counted as skipped-raced, never clobbered).
 *   The same double-assertion protects `municipality_id IS NULL` against a
 *   concurrent live assignment landing mid-run.
 *
 * PROVENANCE — every write is auditable and reversible
 *   Each row this script writes is stamped in the SAME update that sets
 *   `municipality_id`:
 *     • `municipality_attribution_method` = 'title_hint' | 'nearest'
 *     • `municipality_distance_km`        = the measured distance (nearest only)
 *     • `municipality_attribution_ambiguous` = true on a near-tie
 *   So every row this script produced can be found — and undone — with
 *   `WHERE municipality_attribution_method IN ('title_hint','nearest')`.
 *
 * IDEMPOTENT
 *   Only rows with `municipality_id IS NULL` are ever considered, and the
 *   UPDATE re-asserts that predicate.  A second run reports zero candidates
 *   for everything the first run wrote.
 *
 * Usage:
 *   # dry-run (DEFAULT — no writes, ever, unless --execute is passed)
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-municipality-attribution.ts
 *
 *   # live
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-municipality-attribution.ts --execute
 *
 * Options:
 *   --execute          Perform writes.  WITHOUT THIS FLAG THE SCRIPT IS A DRY RUN.
 *   --tenant <id>      Restrict to a single tenant (default: all tenants).
 *   --only <kind>      Restrict to `patrols` or `events` (default: both).
 *   --limit <n>        Cap the number of rows updated per kind (0 = no cap, default).
 *   --pageSize <n>     Keyset page size (default 500; exposed for testing).
 *   --verbose          Print one line per candidate row.
 *
 * Sibling to backfill-patrol-start-time.ts (same .env.dev loading, same
 * platformPrisma access pattern, same dry-run-first discipline).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 1. Load .env.dev (no dotenv dep) ──────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
} else if (!process.env.DATABASE_URL) {
  console.error(
    `[backfill-municipality-attribution] ERROR: .env.dev not found at ${envPath} ` +
      `and DATABASE_URL is not set.`,
  );
  process.exit(1);
}

// ── 2. Parse CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] !== undefined) return args[idx + 1] as string;
  return undefined;
}

/**
 * DRY RUN IS THE DEFAULT.  Writes require the explicit --execute flag.
 * `--dry-run` is accepted for symmetry with the sibling backfills but is a
 * no-op, because dry-run is already the default.
 */
const isExecute = args.includes("--execute");
const isDryRun = !isExecute;
const tenantFilter = getArg("--tenant");
const only = getArg("--only");
const limit = Number(getArg("--limit") ?? "0");
const verbose = args.includes("--verbose");
/** Keyset page size. Exposed only so the pagination path can be exercised in test runs. */
const pageSize = Number(getArg("--pageSize") ?? "500");

if (!Number.isFinite(limit) || limit < 0) {
  console.error(`[backfill-municipality-attribution] ERROR: --limit must be >= 0`);
  process.exit(1);
}
if (!Number.isFinite(pageSize) || pageSize < 1) {
  console.error(`[backfill-municipality-attribution] ERROR: --pageSize must be >= 1`);
  process.exit(1);
}
if (only !== undefined && only !== "patrols" && only !== "events") {
  console.error(`[backfill-municipality-attribution] ERROR: --only must be 'patrols' or 'events'`);
  process.exit(1);
}

const doPatrols = only === undefined || only === "patrols";
const doEvents = only === undefined || only === "events";

// ── 3. Import workspace packages ──────────────────────────────────────────────

import { platformPrisma } from "@marine-guardian/db";
import {
  matchTitleHint,
  nearestWithinCap,
  NEAREST_CAP_KM,
} from "@marine-guardian/shared/lib/municipality-attribution";
import type { MunicipalityForAssignment } from "@marine-guardian/shared/lib/municipality-assignment";

// ── 4. Constants ──────────────────────────────────────────────────────────────

const TAG = "[backfill-municipality-attribution]";

// ── 5. Counters ───────────────────────────────────────────────────────────────

interface Counters {
  candidates: number;
  byTitleHint: number;
  byNearest: number;
  ambiguousFlagged: number;
  unattributedBeyondCap: number;
  noPoint: number;
  garbageCoords: number;
  skippedRaced: number;
}

function newCounters(): Counters {
  return {
    candidates: 0,
    byTitleHint: 0,
    byNearest: 0,
    ambiguousFlagged: 0,
    unattributedBeyondCap: 0,
    noPoint: 0,
    garbageCoords: 0,
    skippedRaced: 0,
  };
}

/**
 * Structurally-invalid coordinates.  Mirrors the guard inside
 * `nearestWithinCap` so the script can COUNT garbage separately from
 * "legitimately too far away" — the two are very different findings and
 * collapsing them would hide a data-quality problem.
 */
function isGarbagePoint(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;
  if (lat === 0 && lon === 0) return true;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return true;
  return false;
}

// ── 6. Municipality loading ───────────────────────────────────────────────────

interface MuniRow extends MunicipalityForAssignment {
  tenantId: string;
}

/**
 * Load municipalities per tenant.  `boundaryGeojson` ONLY — this backfill
 * measures distance to the LAND polygon by design (see header).
 */
async function loadMunicipalities(): Promise<Map<string, MuniRow[]>> {
  const rows = await platformPrisma.municipality.findMany({
    where: tenantFilter ? { tenantId: tenantFilter } : undefined,
    select: {
      id: true,
      slug: true,
      name: true,
      tenantId: true,
      boundaryGeojson: true,
    },
  });

  const byTenant = new Map<string, MuniRow[]>();
  for (const r of rows) {
    if (r.boundaryGeojson == null) continue;
    const list = byTenant.get(r.tenantId) ?? [];
    list.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      tenantId: r.tenantId,
      boundaryGeojson: r.boundaryGeojson,
    });
    byTenant.set(r.tenantId, list);
  }
  return byTenant;
}

// ── 7. Patrols ────────────────────────────────────────────────────────────────

interface PatrolCandidate {
  id: string;
  tenantId: string;
  erPatrolId: string;
  title: string | null;
  lat: number | null;
  lon: number | null;
}

async function backfillPatrols(muniByTenant: Map<string, MuniRow[]>): Promise<Counters> {
  const c = newCounters();
  let cursor: string | null = null;
  let updated = 0;

  for (;;) {
    if (limit > 0 && updated >= limit) break;

    // The candidate SELECT asserts BOTH guarantees:
    //   • municipality_id IS NULL             — only the backlog
    //   • municipality_attribution_method IS DISTINCT FROM 'manual'
    //                                         — never touch a human's call.
    //     IS DISTINCT FROM (not <>) so NULL-method rows still qualify.
    //
    // The patrol point is the recorded start location, falling back to the
    // FIRST coordinate of the materialized track — matching the live
    // start-point attribution rule (a patrol belongs to the municipality it
    // STARTED in, not the ones it passed through).
    const page: PatrolCandidate[] = await platformPrisma.$queryRawUnsafe<PatrolCandidate[]>(
      `
      SELECT p.id,
             p.tenant_id     AS "tenantId",
             p.er_patrol_id  AS "erPatrolId",
             p.title         AS "title",
             COALESCE(
               p.start_location_lat,
               (SELECT (t.track_geojson->'features'->0->'geometry'->'coordinates'->0->>1)::float8
                FROM patrol_tracks t WHERE t.patrol_id = p.id LIMIT 1)
             ) AS "lat",
             COALESCE(
               p.start_location_lon,
               (SELECT (t.track_geojson->'features'->0->'geometry'->'coordinates'->0->>0)::float8
                FROM patrol_tracks t WHERE t.patrol_id = p.id LIMIT 1)
             ) AS "lon"
      FROM   patrols p
      WHERE  p.municipality_id IS NULL
        AND  p.municipality_attribution_method IS DISTINCT FROM 'manual'
        ${tenantFilter ? `AND p.tenant_id = $1` : ``}
        ${cursor ? `AND p.id > ${tenantFilter ? `$2` : `$1`}` : ``}
      ORDER BY p.id ASC
      LIMIT ${pageSize}
      `,
      ...([tenantFilter, cursor].filter((v) => v != null) as string[]),
    );

    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;

    for (const row of page) {
      if (limit > 0 && updated >= limit) break;
      c.candidates++;

      const munis = muniByTenant.get(row.tenantId) ?? [];

      // ── Stage 1: whitelisted whole-token title hint ──────────────────────
      const hit = matchTitleHint(row.title);
      if (hit != null) {
        const muni = munis.find((m) => m.slug === hit.slug);
        if (muni != null) {
          if (verbose) {
            console.log(
              `${TAG}   ${isDryRun ? "WOULD SET" : "SET"} patrol ${row.erPatrolId} ` +
                `→ ${muni.name} (title_hint "${hit.hint}") — ${JSON.stringify(row.title)}`,
            );
          }
          const ok = await writePatrol(row.id, muni.id, "title_hint", null, false);
          if (!ok) {
            c.skippedRaced++;
            continue;
          }
          c.byTitleHint++;
          updated++;
          continue;
        }
        // A whitelisted slug with no matching municipality row in this tenant
        // is a configuration gap, not a match — fall through to the nearest stage.
      }

      // ── Stage 2: 45 km nearest ───────────────────────────────────────────
      if (row.lat == null || row.lon == null) {
        c.noPoint++;
        continue;
      }
      if (isGarbagePoint(row.lat, row.lon)) {
        c.garbageCoords++;
        if (verbose) {
          console.log(
            `${TAG}   GARBAGE patrol ${row.erPatrolId} lat=${row.lat} lon=${row.lon} — left unattributed`,
          );
        }
        continue;
      }

      const near = nearestWithinCap({ lat: row.lat, lon: row.lon }, munis);
      if (near == null) {
        c.unattributedBeyondCap++;
        continue;
      }

      if (verbose) {
        const nm = munis.find((m) => m.id === near.municipalityId)?.name ?? near.municipalityId;
        console.log(
          `${TAG}   ${isDryRun ? "WOULD SET" : "SET"} patrol ${row.erPatrolId} → ${nm} ` +
            `(nearest ${near.distanceKm.toFixed(2)} km${near.ambiguous ? ", AMBIGUOUS" : ""})`,
        );
      }

      const ok = await writePatrol(
        row.id,
        near.municipalityId,
        "nearest",
        near.distanceKm,
        near.ambiguous,
      );
      if (!ok) {
        c.skippedRaced++;
        continue;
      }
      c.byNearest++;
      if (near.ambiguous) c.ambiguousFlagged++;
      updated++;
    }
  }

  return c;
}

/**
 * Write one patrol.  Returns false when the row lost a race (0 rows matched)
 * so the caller can count it as skipped rather than as a write.
 *
 * Both guarantees are RE-ASSERTED in the WHERE clause — they hold against a
 * concurrent writer, not merely against the SELECT we did a moment ago.
 */
async function writePatrol(
  id: string,
  municipalityId: string,
  method: "title_hint" | "nearest",
  distanceKm: number | null,
  ambiguous: boolean,
): Promise<boolean> {
  if (isDryRun) return true;
  const res = await platformPrisma.patrol.updateMany({
    where: {
      id,
      municipalityId: null,
      // NULL-SAFE "not manual". Prisma's `{ not: "manual" }` alone compiles to
      // SQL `<> 'manual'`, which evaluates to NULL (not TRUE) for rows whose
      // method IS NULL — so it would silently match ZERO backlog rows, since
      // every unattributed row has a NULL method. The explicit OR reproduces
      // the `IS DISTINCT FROM 'manual'` semantics used in the candidate SELECT.
      OR: [
        { municipalityAttributionMethod: null },
        { municipalityAttributionMethod: { not: "manual" } },
      ],
    },
    data: {
      municipalityId,
      municipalityAssignedAt: new Date(),
      municipalityAttributionMethod: method,
      municipalityDistanceKm: distanceKm,
      municipalityAttributionAmbiguous: ambiguous,
    },
  });
  return res.count > 0;
}

// ── 8. Events ─────────────────────────────────────────────────────────────────

interface EventCandidate {
  id: string;
  tenantId: string;
  erEventId: string;
  lat: number | null;
  lon: number | null;
}

async function backfillEvents(muniByTenant: Map<string, MuniRow[]>): Promise<Counters> {
  const c = newCounters();
  let cursor: string | null = null;
  let updated = 0;

  for (;;) {
    if (limit > 0 && updated >= limit) break;

    const page: EventCandidate[] = await platformPrisma.$queryRawUnsafe<EventCandidate[]>(
      `
      SELECT e.id,
             e.tenant_id   AS "tenantId",
             e.er_event_id AS "erEventId",
             e.location_lat AS "lat",
             e.location_lon AS "lon"
      FROM   events e
      WHERE  e.municipality_id IS NULL
        AND  e.municipality_attribution_method IS DISTINCT FROM 'manual'
        ${tenantFilter ? `AND e.tenant_id = $1` : ``}
        ${cursor ? `AND e.id > ${tenantFilter ? `$2` : `$1`}` : ``}
      ORDER BY e.id ASC
      LIMIT ${pageSize}
      `,
      ...([tenantFilter, cursor].filter((v) => v != null) as string[]),
    );

    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;

    for (const row of page) {
      if (limit > 0 && updated >= limit) break;
      c.candidates++;

      // Events get NO title hints — 12 distinct titles across 5,139 rows,
      // half NULL. Straight to the nearest stage.
      if (row.lat == null || row.lon == null) {
        c.noPoint++;
        continue;
      }
      if (isGarbagePoint(row.lat, row.lon)) {
        c.garbageCoords++;
        if (verbose) {
          console.log(
            `${TAG}   GARBAGE event ${row.erEventId} lat=${row.lat} lon=${row.lon} — left unattributed`,
          );
        }
        continue;
      }

      const munis = muniByTenant.get(row.tenantId) ?? [];
      const near = nearestWithinCap({ lat: row.lat, lon: row.lon }, munis);
      if (near == null) {
        c.unattributedBeyondCap++;
        continue;
      }

      if (verbose) {
        const nm = munis.find((m) => m.id === near.municipalityId)?.name ?? near.municipalityId;
        console.log(
          `${TAG}   ${isDryRun ? "WOULD SET" : "SET"} event ${row.erEventId} → ${nm} ` +
            `(nearest ${near.distanceKm.toFixed(2)} km${near.ambiguous ? ", AMBIGUOUS" : ""})`,
        );
      }

      if (!isDryRun) {
        const res = await platformPrisma.event.updateMany({
          where: {
            id: row.id,
            municipalityId: null,
            // NULL-safe "not manual" — see the note in writePatrol(); a bare
            // `{ not: "manual" }` would match zero NULL-method backlog rows.
            OR: [
              { municipalityAttributionMethod: null },
              { municipalityAttributionMethod: { not: "manual" } },
            ],
          },
          data: {
            municipalityId: near.municipalityId,
            municipalityAssignedAt: new Date(),
            municipalityAttributionMethod: "nearest",
            municipalityDistanceKm: near.distanceKm,
            municipalityAttributionAmbiguous: near.ambiguous,
          },
        });
        if (res.count === 0) {
          c.skippedRaced++;
          continue;
        }
      }

      c.byNearest++;
      if (near.ambiguous) c.ambiguousFlagged++;
      updated++;
    }
  }

  return c;
}

// ── 9. Reporting ──────────────────────────────────────────────────────────────

/**
 * A wholesale skip rate is NEVER a real race.
 *
 * On the first live run of this script every single UPDATE matched 0 rows and
 * was counted as "raced" — the WHERE clause used Prisma's `{ not: "manual" }`,
 * which compiles to `<> 'manual'` and therefore evaluates to NULL (not TRUE)
 * for the NULL-method backlog rows it was meant to match. The run looked
 * plausible: it reported candidates, it reported skips, it exited 0.
 *
 * Genuine races are rare and individual. If a large fraction of attributable
 * rows "raced", the predicate is wrong — so fail LOUDLY rather than reporting a
 * confident zero.
 */
function assertRaceRateSane(kind: string, c: Counters): void {
  const attributable = c.byTitleHint + c.byNearest + c.skippedRaced;
  if (attributable === 0) return;
  const rate = c.skippedRaced / attributable;
  if (rate > 0.25) {
    console.error("");
    console.error(
      `${TAG} FATAL: ${kind} — ${c.skippedRaced}/${attributable} ` +
        `(${(rate * 100).toFixed(1)}%) of attributable rows reported as "raced".\n` +
        `${TAG}        A wholesale skip rate is not a race — it means the UPDATE\n` +
        `${TAG}        WHERE clause matched nothing (suspect a NULL-vs-<> trap on a\n` +
        `${TAG}        nullable column). Refusing to report a misleading result.`,
    );
    process.exitCode = 1;
  }
}

function report(kind: string, c: Counters): void {
  const w = isDryRun ? "would-attribute" : "attributed";
  console.log(`${TAG} ──── ${kind} ────`);
  console.log(`${TAG}   candidates (municipality_id IS NULL, not manual) : ${c.candidates}`);
  console.log(`${TAG}   ${w} by title_hint                        : ${c.byTitleHint}`);
  console.log(`${TAG}   ${w} by nearest (<= ${NEAREST_CAP_KM} km)          : ${c.byNearest}`);
  console.log(`${TAG}     └─ of which flagged AMBIGUOUS (near-tie)      : ${c.ambiguousFlagged}`);
  console.log(`${TAG}   left UNATTRIBUTED — beyond the ${NEAREST_CAP_KM} km cap     : ${c.unattributedBeyondCap}`);
  console.log(`${TAG}   left UNATTRIBUTED — no usable point            : ${c.noPoint}`);
  console.log(`${TAG}   left UNATTRIBUTED — garbage coordinates        : ${c.garbageCoords}`);
  console.log(`${TAG}   skipped — raced (filled or flipped to manual)  : ${c.skippedRaced}`);
  console.log("");
}

// ── 10. Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = isDryRun ? "[DRY-RUN]" : "[LIVE]";
  console.log(
    `${TAG} ${mode} tenant=${tenantFilter ?? "ALL"} only=${only ?? "patrols+events"} ` +
      `limit=${limit === 0 ? "none" : String(limit)} cap=${NEAREST_CAP_KM}km`,
  );
  if (isDryRun) {
    console.log(`${TAG} dry-run is the DEFAULT — pass --execute to write.`);
  }
  console.log("");

  const muniByTenant = await loadMunicipalities();
  const totalMunis = [...muniByTenant.values()].reduce((n, l) => n + l.length, 0);
  console.log(
    `${TAG} loaded ${totalMunis} municipalities across ${muniByTenant.size} tenant(s) ` +
      `(boundaryGeojson / LAND polygon only — by design)`,
  );
  console.log("");

  if (doPatrols) {
    const c = await backfillPatrols(muniByTenant);
    report("PATROLS (title hints + nearest)", c);
    assertRaceRateSane("PATROLS", c);
  }
  if (doEvents) {
    const c = await backfillEvents(muniByTenant);
    report("EVENTS (nearest only — titles carry no signal)", c);
    assertRaceRateSane("EVENTS", c);
  }

  console.log(
    `${TAG} PROVENANCE: every written row is stamped with\n` +
      `${TAG}             municipality_attribution_method = 'title_hint' | 'nearest',\n` +
      `${TAG}             municipality_distance_km (nearest), and\n` +
      `${TAG}             municipality_attribution_ambiguous on a near-tie — so this\n` +
      `${TAG}             backfill's writes are findable and reversible via\n` +
      `${TAG}             WHERE municipality_attribution_method IN ('title_hint','nearest').\n` +
      `${TAG} MANUAL WINS: rows with method = 'manual' are never touched — asserted in\n` +
      `${TAG}             BOTH the candidate SELECT and the UPDATE WHERE clause.\n` +
      `${TAG} LIVE PIPELINE UNCHANGED: municipality-assign.processor.ts is untouched;\n` +
      `${TAG}             new records that geometry cannot attribute stay UNATTRIBUTED\n` +
      `${TAG}             for manual officer assignment.`,
  );

  if (isDryRun) {
    console.log("");
    console.log(`${TAG} DRY RUN — no writes were performed. Re-run with --execute to apply.`);
  }
}

main()
  .then(async () => {
    await platformPrisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error(`${TAG} FATAL:`, err);
    await platformPrisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
