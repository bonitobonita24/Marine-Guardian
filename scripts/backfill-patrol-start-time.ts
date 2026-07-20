#!/usr/bin/env tsx
/**
 * backfill-patrol-start-time.ts
 *
 * Backfills `patrols.start_time` for patrols where EarthRanger omitted it.
 *
 * WHY
 *   er-sync.processor.ts (syncPatrols) passes ER's `start_time` straight
 *   through with no fallback.  For a subset of patrols — overwhelmingly
 *   `foot` patrols — ER simply does not supply one, leaving `start_time`
 *   NULL.  Those patrols fall out of every date-windowed report.
 *
 * SOURCE OF TRUTH — patrol_segments.actual_start, AND NOTHING ELSE
 *   `patrol_segments.actual_start` is the ONLY trustworthy derivation source:
 *   on the patrols where both values exist it agrees with `start_time`
 *   exactly 99.07% of the time.
 *
 *   Explicitly REJECTED sources (do NOT reintroduce them):
 *     • patrol_tracks.since         — circular.  patrol-track-materialization.ts
 *                                     computes it as
 *                                     `seg?.actualStart ?? seg?.scheduledStart ?? patrol.startTime`,
 *                                     so it merely mirrors start_time (median AND
 *                                     max delta 0.000s across 4078 rows).
 *     • er_original_snapshot->>'start_time'
 *                                   — never populated (0 of 5011 patrols).
 *     • patrol_segments.scheduled_start
 *                                   — always empty in this database.
 *     • patrols.created_at / end_time
 *                                   — record-keeping / unrelated timestamps.
 *
 * IDEMPOTENT
 *   Only rows where `start_time IS NULL` are ever considered, and the UPDATE
 *   re-asserts that predicate.  Safe to re-run; a second run reports zero
 *   candidates for anything the first run wrote.
 *
 * PROVENANCE
 *   There is currently NO column that distinguishes a derived start_time from
 *   an ER-supplied one, and this script deliberately does NOT add one.
 *   See the "PROVENANCE" note printed at the end of every run.
 *
 * Usage:
 *   # dry-run (DEFAULT — no writes, ever, unless --execute is passed)
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-patrol-start-time.ts
 *
 *   # live
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-patrol-start-time.ts --execute
 *
 * Options:
 *   --execute          Perform writes.  WITHOUT THIS FLAG THE SCRIPT IS A DRY RUN.
 *   --tenantId <id>    Restrict to a single tenant (default: all tenants).
 *   --limit <n>        Cap the number of patrols updated (0 = no cap, default).
 *   --pageSize <n>     Keyset page size (default 500; exposed for testing).
 *   --verbose          Print one line per candidate patrol.
 *
 * Sibling to backfill-rangers-from-segments.ts (same .env.dev loading, same
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
    `[backfill-patrol-start-time] ERROR: .env.dev not found at ${envPath} ` +
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
const tenantFilter = getArg("--tenantId");
const limit = Number(getArg("--limit") ?? "0");
const verbose = args.includes("--verbose");
/** Keyset page size. Exposed only so the pagination path can be exercised in test runs. */
const pageSize = Number(getArg("--pageSize") ?? "500");

if (!Number.isFinite(limit) || limit < 0) {
  console.error(`[backfill-patrol-start-time] ERROR: --limit must be >= 0`);
  process.exit(1);
}
if (!Number.isFinite(pageSize) || pageSize < 1) {
  console.error(`[backfill-patrol-start-time] ERROR: --pageSize must be >= 1`);
  process.exit(1);
}

// ── 3. Import workspace packages ──────────────────────────────────────────────
// Imports resolve at module load; env vars above are already in process.env by
// the time Prisma initialises its connection pool.

import { platformPrisma } from "@marine-guardian/db";

// ── 4. Constants ──────────────────────────────────────────────────────────────

const TAG = "[backfill-patrol-start-time]";

// ── 5. Main ───────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  tenantId: string;
  erPatrolId: string;
  patrolType: string;
  derivedStart: Date | null;
}

async function main(): Promise<void> {
  const mode = isDryRun ? "[DRY-RUN]" : "[LIVE]";
  console.log(
    `${TAG} ${mode} tenant=${tenantFilter ?? "ALL"} limit=${limit === 0 ? "none" : String(limit)}`,
  );
  if (isDryRun) {
    console.log(`${TAG} dry-run is the DEFAULT — pass --execute to write.`);
  }

  let candidates = 0;
  let updated = 0;
  let skippedNoSource = 0;
  const perTenant = new Map<string, { candidates: number; updated: number; skipped: number }>();

  // Keyset pagination over patrol id (stable, no OFFSET drift as rows are
  // updated mid-run — updated rows no longer match `start_time IS NULL`, and
  // keyset ordering means we never revisit or skip a page because of that).
  let cursor: string | null = null;

  for (;;) {
    if (limit > 0 && updated >= limit) break;

    // MIN(actual_start) — in the current dev dataset every candidate has
    // exactly one segment carrying actual_start, but MIN makes the derivation
    // deterministic if that ever stops holding: the patrol starts when its
    // earliest segment actually started.
    const page: Candidate[] = await platformPrisma.$queryRawUnsafe<Candidate[]>(
      `
      SELECT p.id,
             p.tenant_id    AS "tenantId",
             p.er_patrol_id AS "erPatrolId",
             p.patrol_type::text AS "patrolType",
             (
               SELECT MIN(s.actual_start)
               FROM   patrol_segments s
               WHERE  s.patrol_id = p.id
                 AND  s.actual_start IS NOT NULL
             ) AS "derivedStart"
      FROM   patrols p
      WHERE  p.start_time IS NULL
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

      candidates++;
      const t = perTenant.get(row.tenantId) ?? { candidates: 0, updated: 0, skipped: 0 };
      t.candidates++;

      if (row.derivedStart == null) {
        skippedNoSource++;
        t.skipped++;
        perTenant.set(row.tenantId, t);
        if (verbose) {
          console.log(`${TAG}   SKIP  ${row.erPatrolId} (${row.patrolType}) — no segment actual_start`);
        }
        continue;
      }

      if (verbose) {
        console.log(
          `${TAG}   ${isDryRun ? "WOULD SET" : "SET"} ${row.erPatrolId} (${row.patrolType}) ` +
            `start_time = ${row.derivedStart.toISOString()}`,
        );
      }

      if (!isDryRun) {
        // The `startTime: null` predicate is re-asserted here so a concurrent
        // ER sync that filled the value in mid-run wins over our derivation.
        const res = await platformPrisma.patrol.updateMany({
          where: { id: row.id, startTime: null },
          data: { startTime: row.derivedStart },
        });
        if (res.count === 0) {
          // Raced — ER supplied a real start_time between SELECT and UPDATE.
          skippedNoSource++;
          t.skipped++;
          perTenant.set(row.tenantId, t);
          continue;
        }
      }

      updated++;
      t.updated++;
      perTenant.set(row.tenantId, t);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("");
  console.log(`${TAG} ──────── SUMMARY ${mode} ────────`);
  console.log(`${TAG} candidates found   : ${candidates}  (patrols with start_time IS NULL)`);
  console.log(`${TAG} ${isDryRun ? "would update      " : "updated           "} : ${updated}  (derived from patrol_segments.actual_start)`);
  console.log(`${TAG} skipped-no-source  : ${skippedNoSource}  (no segment actual_start to derive from)`);

  if (perTenant.size > 1) {
    console.log(`${TAG} per-tenant:`);
    for (const [tid, c] of [...perTenant.entries()].sort()) {
      console.log(`${TAG}   ${tid}  candidates=${c.candidates} ${isDryRun ? "would-update" : "updated"}=${c.updated} skipped=${c.skipped}`);
    }
  }

  console.log("");
  console.log(
    `${TAG} PROVENANCE: no column distinguishes a derived start_time from an\n` +
      `${TAG}             ER-supplied one. This script does NOT add one. After a\n` +
      `${TAG}             live run the ${updated} derived value(s) are indistinguishable\n` +
      `${TAG}             from ER data. See the script header.`,
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
