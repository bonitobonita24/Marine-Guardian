#!/usr/bin/env tsx
/**
 * backfill-subject-positions-from-observations.ts
 *
 * Seeds Subject.lastPositionLat/Lon/At from each subject's most-recent
 * observation that has a real fix. In EarthRanger a subject's position IS
 * its latest observation, but the recurring subjects sync only writes a
 * position when ER's /subjects endpoint echoes `last_position` on that call
 * — which it doesn't always do — so many subjects that DO have observation
 * history sit with a null position. That's why the Command Center map's
 * "Hide idle on map" toggle has nothing to hide: InteractiveMap renders zero
 * ranger markers when lastPositionLat/Lon/At are null. This is the one-time
 * catch-up; the durable fix (er-sync.processor.ts syncSubjects) now leaves
 * an existing position untouched instead of nulling it back out.
 *
 * Idempotent: only touches a Subject when its lastPositionAt is null OR
 * older than the candidate observation's recordedAt. Only ever UPDATEs
 * position columns — no deletes, no other fields touched.
 *
 * A fix of (0, 0) is EarthRanger's classic "no fix" sentinel and is treated
 * as no-fix — such observations are skipped in favor of the next most
 * recent real fix.
 *
 * Usage:
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-subject-positions-from-observations.ts [options]
 *
 * Options:
 *   --tenant <id>   Restrict to one tenant (default: ALL tenants).
 *   --dry-run       Print planned counts only; perform NO writes.
 *
 * Sibling to backfill-rangers-from-segments.ts (data-backfill variant; no
 * BullMQ queue involved — runs directly against Postgres via platformPrisma).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 1. Load .env.dev (no dotenv dep) ──────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");

if (!fs.existsSync(envPath)) {
  console.error(
    `[backfill-subject-positions-from-observations] ERROR: .env.dev not found at ${envPath}`,
  );
  process.exit(1);
}

for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (k && !process.env[k]) process.env[k] = v;
}

// ── 2. Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] !== undefined) {
    return args[idx + 1];
  }
  return undefined;
}

const tenantIdArg = getArg("--tenant");
const isDryRun = args.includes("--dry-run");

// ── 3. Import workspace packages ───────────────────────────────────────────────
// Imports are resolved at module load time; env vars set above are already in
// process.env by the time Prisma initialises its connection pool.

import { Prisma } from "@prisma/client";
import { platformPrisma } from "@marine-guardian/db";

// ── 4. Types for $queryRaw results ─────────────────────────────────────────────

interface CandidatePosition {
  subject_id: string;
  location_lat: number;
  location_lon: number;
  recorded_at: Date;
}

// ── 5. Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = isDryRun ? "[dry-run]" : "[live]";
  const scope = tenantIdArg ? `tenantId=${tenantIdArg}` : "ALL tenants";
  console.log(
    `[backfill-subject-positions-from-observations] ${mode} scope=${scope}`,
  );

  const tenantFilter = tenantIdArg
    ? Prisma.sql`AND s.tenant_id = ${tenantIdArg}`
    : Prisma.empty;

  // For each subject that has NO map position (lastPositionLat/Lon null — the
  // case that keeps a ranger off the map even when lastPositionAt carries a
  // stale timestamp) OR whose lastPositionAt is null/older than its latest real
  // (non 0,0) observation fix, pick that observation's lat/lon/recordedAt as the
  // candidate. DISTINCT ON picks the most-recent-per-subject row.
  const candidates = await platformPrisma.$queryRaw<CandidatePosition[]>`
    SELECT DISTINCT ON (o.subject_id)
      o.subject_id,
      o.location_lat,
      o.location_lon,
      o.recorded_at
    FROM   observations o
    JOIN   subjects s ON s.id = o.subject_id
    WHERE  o.subject_id IS NOT NULL
      AND  o.location_lat IS NOT NULL
      AND  o.location_lon IS NOT NULL
      AND  NOT (o.location_lat = 0 AND o.location_lon = 0)
      AND  (s.last_position_lat IS NULL OR s.last_position_lon IS NULL
            OR s.last_position_at IS NULL OR s.last_position_at < o.recorded_at)
      ${tenantFilter}
    ORDER BY o.subject_id, o.recorded_at DESC
  `;

  console.log(
    `[backfill-subject-positions-from-observations] planned: ${candidates.length} subject(s) to update`,
  );

  if (isDryRun) {
    console.log(
      `[backfill-subject-positions-from-observations] dry-run — no writes performed.`,
    );
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const c of candidates) {
    try {
      await platformPrisma.subject.update({
        where: { id: c.subject_id },
        data: {
          lastPositionLat: c.location_lat,
          lastPositionLon: c.location_lon,
          lastPositionAt: c.recorded_at,
        },
      });
      updated++;
    } catch (err) {
      console.error(
        `[backfill-subject-positions-from-observations] failed to update subject ${c.subject_id}:`,
        err,
      );
      skipped++;
    }
  }

  console.log(
    `[backfill-subject-positions-from-observations] DONE — updated=${updated}, skipped=${skipped}`,
  );
}

main()
  .then(async () => {
    await platformPrisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error("[backfill-subject-positions-from-observations] FATAL:", err);
    await platformPrisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
