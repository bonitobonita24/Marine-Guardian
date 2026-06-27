#!/usr/bin/env tsx
/**
 * backfill-rangers-from-segments.ts
 *
 * Derives KnownRanger + AccompanyingRanger rows from already-harvested ER
 * patrol-segment leader data so that the dashboard Ranger Roster shows real
 * rangers instead of an empty list.
 *
 * Idempotent:
 *   • KnownRanger rows are upserted on the (tenantId, erSubjectId) unique key.
 *   • AccompanyingRanger rows that are linked to a KnownRanger (knownRangerId
 *     IS NOT NULL) are deleted then recreated.  Operator-entered freetext rows
 *     (knownRangerId = null) are left untouched.
 *
 * Usage:
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-rangers-from-segments.ts [options]
 *
 * Options:
 *   --tenantId <id>   Tenant to backfill (default: cmoruubw20000gmx3jx7zudmy — demo-site)
 *   --dry-run         Print planned counts only; perform NO writes.
 *
 * Sibling to verify-patrol-track-materialize.ts (data-backfill variant; no
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
    `[backfill-rangers-from-segments] ERROR: .env.dev not found at ${envPath}`,
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

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] !== undefined) {
    return args[idx + 1] as string;
  }
  return fallback;
}

const tenantId = getArg("--tenantId", "cmoruubw20000gmx3jx7zudmy");
const isDryRun = args.includes("--dry-run");

// ── 3. Import workspace packages ───────────────────────────────────────────────
// Imports are resolved at module load time; env vars set above are already in
// process.env by the time Prisma initialises its connection pool.

import { platformPrisma } from "@marine-guardian/db";

// ── 4. Types for $queryRaw results ─────────────────────────────────────────────

interface DistinctLeader {
  leader_er_id: string;
  leader_name: string;
}

interface PatrolLink {
  patrol_id: string;
  leader_er_id: string;
}

// ── 5. Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 1000;

// ── 6. Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = isDryRun ? "[dry-run]" : "[live]";
  console.log(
    `[backfill-rangers-from-segments] ${mode} tenantId=${tenantId}`,
  );

  // Step 1 — Resolve addedByUserId (site_admin preferred, super_admin fallback).
  // AccompanyingRanger.addedByUserId is a non-nullable FK so we need a real user.
  const siteAdmin = await platformPrisma.user.findFirst({
    where: { tenantId, role: "site_admin" },
    select: { id: true, role: true },
  });

  const resolvedUser =
    siteAdmin ??
    (await platformPrisma.user.findFirst({
      where: { tenantId, role: "super_admin" },
      select: { id: true, role: true },
    }));

  if (!resolvedUser) {
    console.error(
      `[backfill-rangers-from-segments] ERROR: No site_admin or super_admin user found ` +
        `for tenantId=${tenantId}. Cannot populate addedByUserId. ` +
        `Ensure at least one admin user exists for this tenant before running this script.`,
    );
    await platformPrisma.$disconnect();
    process.exit(1);
  }

  const addedByUserId = resolvedUser.id;
  console.log(
    `[backfill-rangers-from-segments] addedByUserId=${addedByUserId} (role=${resolvedUser.role})`,
  );

  // Step 2 — Source data from patrol_segments joined to patrols.
  const distinctLeaders = await platformPrisma.$queryRaw<DistinctLeader[]>`
    SELECT DISTINCT ps.leader_er_id, ps.leader_name
    FROM   patrol_segments ps
    JOIN   patrols p ON p.id = ps.patrol_id
    WHERE  p.tenant_id  = ${tenantId}
      AND  ps.leader_er_id IS NOT NULL
      AND  ps.leader_name  IS NOT NULL
  `;

  const patrolLinks = await platformPrisma.$queryRaw<PatrolLink[]>`
    SELECT DISTINCT ps.patrol_id, ps.leader_er_id
    FROM   patrol_segments ps
    JOIN   patrols p ON p.id = ps.patrol_id
    WHERE  p.tenant_id  = ${tenantId}
      AND  ps.leader_er_id IS NOT NULL
  `;

  // Step 3 — Print planned counts (also the dry-run exit point).
  console.log(
    `[backfill-rangers-from-segments] planned: ` +
      `${distinctLeaders.length} known rangers to upsert, ` +
      `${patrolLinks.length} patrol AccompanyingRanger rows to create`,
  );

  if (isDryRun) {
    console.log(
      `[backfill-rangers-from-segments] dry-run — no writes performed.`,
    );
    return;
  }

  // Step 4a — Upsert each distinct patrol-segment leader as a KnownRanger.
  const knownRangerMap = new Map<string, string>(); // erSubjectId → knownRanger.id
  let upsertCount = 0;

  for (const leader of distinctLeaders) {
    const kr = await platformPrisma.knownRanger.upsert({
      where: {
        tenantId_erSubjectId: {
          tenantId,
          erSubjectId: leader.leader_er_id,
        },
      },
      update: {
        name: leader.leader_name,
      },
      create: {
        tenantId,
        name: leader.leader_name,
        source: "earthranger_sync",
        erSubjectId: leader.leader_er_id,
        isActive: true,
      },
      select: { id: true },
    });
    knownRangerMap.set(leader.leader_er_id, kr.id);
    upsertCount++;
  }

  console.log(
    `[backfill-rangers-from-segments] upserted ${upsertCount} KnownRanger rows`,
  );

  // Step 4b — Idempotent reset: delete AR rows that are already linked to a
  // KnownRanger so we can recreate them cleanly.  Operator-entered rows
  // (knownRangerId = null) are intentionally left untouched.
  const { count: deletedCount } =
    await platformPrisma.accompanyingRanger.deleteMany({
      where: {
        tenantId,
        entityType: "patrol",
        knownRangerId: { not: null },
      },
    });

  console.log(
    `[backfill-rangers-from-segments] deleted ${deletedCount} existing known-ranger-linked AccompanyingRanger rows`,
  );

  // Step 4c — Build AccompanyingRanger create payloads from patrolLinks.
  const arRows = patrolLinks
    .filter((link) => knownRangerMap.has(link.leader_er_id))
    .map((link) => ({
      tenantId,
      entityType: "patrol" as const,
      entityId: link.patrol_id,
      rangerType: "freetext" as const,
      knownRangerId: knownRangerMap.get(link.leader_er_id) as string,
      addedByUserId,
    }));

  // Insert in batches to avoid overwhelming the connection pool.
  let createdCount = 0;
  for (let offset = 0; offset < arRows.length; offset += BATCH_SIZE) {
    const batch = arRows.slice(offset, offset + BATCH_SIZE);
    const result = await platformPrisma.accompanyingRanger.createMany({
      data: batch,
    });
    createdCount += result.count;
  }

  console.log(
    `[backfill-rangers-from-segments] created ${createdCount} AccompanyingRanger rows`,
  );

  // Step 5 — Summary.
  console.log(
    `[backfill-rangers-from-segments] DONE — ` +
      `knownRangers upserted=${upsertCount}, ` +
      `AR deleted=${deletedCount}, ` +
      `AR created=${createdCount}`,
  );
}

main()
  .then(async () => {
    await platformPrisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error("[backfill-rangers-from-segments] FATAL:", err);
    await platformPrisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
