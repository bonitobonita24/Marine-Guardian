#!/usr/bin/env tsx
/**
 * verify-patrol-track-materialize.ts
 *
 * Option E live-QA harness — verifies the PatrolTrack materialization BullMQ
 * pipeline end-to-end:
 *   enqueuePatrolTrackMaterialize → Valkey → worker → BullMQ completed/failed
 *
 * Polls BullMQ job state (NOT Postgres) because the worker may legitimately
 * skip without writing to patrol_tracks when preconditions fail (no ER
 * credentials, no segments, no leader assignment).  A clean skip is still a
 * successful pipeline traversal — PASS is decided by BullMQ state "completed",
 * not by whether a DB row changed.
 *
 * The optional Postgres BEFORE/AFTER snapshot is purely informational.
 *
 * Usage:
 *   pnpm tsx scripts/verify-patrol-track-materialize.ts [options]
 *
 * Options:
 *   --tenantId   <id>   (default: cmoruubw20000gmx3jx7zudmy — demo-site)
 *   --patrolId   <id>   (default: cmpqv0d4l000ygmgssbnrmt9x — Active Surveillance)
 *   --timeout-ms <ms>   poll timeout (default: 30000)
 *
 * Sibling to verify-area-rederive.ts (186L, shipped 2026-06-01).
 * Reusable template for any future deferred-job harness whose worker may not
 * write directly to Postgres (e.g. pdf-render, email, alerts).  Clone + swap
 * enqueuePatrolTrackMaterialize → your enqueue fn + update the returnvalue
 * shape.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 1. Load .env.dev (no dotenv dep) ──────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");

if (!fs.existsSync(envPath)) {
  console.error(
    `[verify-patrol-track-materialize] ERROR: .env.dev not found at ${envPath}`,
  );
  process.exit(1);
}

const envLines = fs.readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (key && !process.env[key]) {
    process.env[key] = val;
  }
}

// ── 2. Parse CLI args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] !== undefined) {
    return args[idx + 1] as string;
  }
  return fallback;
}

const tenantId = getArg("--tenantId", "cmoruubw20000gmx3jx7zudmy");
const patrolId = getArg("--patrolId", "cmpqv0d4l000ygmgssbnrmt9x");
const timeoutMs = parseInt(getArg("--timeout-ms", "30000"), 10);

// ── 3. Import workspace packages ──────────────────────────────────────────
// Imports are resolved at module load time; env vars set above are already
// in process.env by the time these modules initialise their Redis/Prisma clients.

import {
  enqueuePatrolTrackMaterialize,
  getPatrolTrackMaterializeQueue,
  closeAllQueues,
} from "@marine-guardian/jobs";
import { platformPrisma } from "@marine-guardian/db";

// ── 4. Types ───────────────────────────────────────────────────────────────

// Structural copy of the worker's internal MaterializationResult.
// The real type lives in packages/jobs/src/lib/patrol-track-materialization.ts
// and is not guaranteed to be re-exported from the package barrel.
interface MaterializationResult {
  patrolTrackId: string | null;
  pointCount: number;
  hasTimestamps: boolean;
  lastTrackTime: Date | null;
  patrolEnded: boolean;
  skipped: boolean;
  skipReason?: "no_segment" | "no_leader" | "no_credentials" | string;
}

interface PatrolTrackSnapshot {
  id: string;
  pointCount: number;
  hasTimestamps: boolean;
  lastTrackTime: Date | null;
  fetchedAt: Date;
}

// ── 5. Snapshot helpers ────────────────────────────────────────────────────

async function fetchPatrolTrackSnapshot(): Promise<PatrolTrackSnapshot | null> {
  return platformPrisma.patrolTrack.findUnique({
    where: { patrolId },
    select: {
      id: true,
      pointCount: true,
      hasTimestamps: true,
      lastTrackTime: true,
      fetchedAt: true,
    },
  });
}

function fmtSnapshot(row: PatrolTrackSnapshot | null): string {
  if (row === null) {
    return "patrolTrackId=null";
  }
  return (
    `patrolTrackId=${row.id}` +
    ` pointCount=${row.pointCount}` +
    ` hasTimestamps=${row.hasTimestamps}` +
    ` fetchedAt=${row.fetchedAt.toISOString()}`
  );
}

function describeChange(
  before: PatrolTrackSnapshot | null,
  after: PatrolTrackSnapshot | null,
): string {
  if (before === null && after === null) return "(unchanged — no row)";
  if (before === null && after !== null) return "(created)";
  if (before !== null && after === null) return "(deleted — unexpected)";
  if (before !== null && after !== null) {
    if (
      before.pointCount !== after.pointCount ||
      before.hasTimestamps !== after.hasTimestamps ||
      before.fetchedAt.getTime() !== after.fetchedAt.getTime()
    ) {
      return "(updated)";
    }
    return "(unchanged)";
  }
  return "";
}

// ── 6. Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `[verify-patrol-track-materialize] tenantId=${tenantId} patrolId=${patrolId} timeout=${timeoutMs}ms`,
  );

  // Informational pre-snapshot
  const before = await fetchPatrolTrackSnapshot();
  console.log(`[verify-patrol-track-materialize] BEFORE: ${fmtSnapshot(before)}`);

  // Enqueue
  const jobId = await enqueuePatrolTrackMaterialize({
    tenantId,
    userId: "system",
    patrolId,
  });
  console.log(`[verify-patrol-track-materialize] enqueued jobId=${jobId}`);

  // Poll BullMQ job state
  const queue = getPatrolTrackMaterializeQueue();
  const startMs = Date.now();
  let state: string = "waiting";
  let lastState: string = "";
  let passed = false;
  let timedOut = false;

  while (Date.now() - startMs < timeoutMs) {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    const job = await queue.getJob(jobId);
    if (!job) continue; // rare race — job not yet visible in Redis

    state = await job.getState();

    if (state !== lastState) {
      if (lastState === "") {
        process.stdout.write(
          `[verify-patrol-track-materialize] state: ${state}`,
        );
      } else {
        process.stdout.write(` → ${state}`);
      }
      lastState = state;
    }

    if (state === "completed" || state === "failed") {
      process.stdout.write("\n");
      break;
    }
  }

  if (state !== "completed" && state !== "failed") {
    // Timed out mid-flight
    process.stdout.write("\n");
    timedOut = true;
  }

  const elapsedMs = Date.now() - startMs;

  // Resolve final job object for returnvalue / failedReason
  const finalJob = await queue.getJob(jobId);

  if (state === "completed" && finalJob !== undefined) {
    const result = finalJob.returnvalue as MaterializationResult;
    console.log(
      `[verify-patrol-track-materialize] returnvalue: ${JSON.stringify(
        result,
        null,
        2,
      )}`,
    );
    passed = true;
  } else if (state === "failed" && finalJob !== undefined) {
    console.log(
      `[verify-patrol-track-materialize] failedReason: ${finalJob.failedReason ?? "(unknown)"}`,
    );
  }

  // Informational post-snapshot
  const after = await fetchPatrolTrackSnapshot();
  const changeLabel = describeChange(before, after);
  console.log(
    `[verify-patrol-track-materialize] AFTER:  ${fmtSnapshot(after)} ${changeLabel}`,
  );

  // Result line
  if (passed) {
    const result =
      state === "completed" && finalJob !== undefined
        ? (finalJob.returnvalue as MaterializationResult)
        : null;

    if (result?.skipped === true) {
      console.log(
        `[verify-patrol-track-materialize] PASS in ${elapsedMs}ms (skip path — skipReason=${result.skipReason ?? "unknown"})`,
      );
    } else if (result !== null && result.patrolTrackId !== null) {
      console.log(
        `[verify-patrol-track-materialize] PASS in ${elapsedMs}ms` +
          ` (PatrolTrack upserted: patrolTrackId=${result.patrolTrackId},` +
          ` pointCount=${result.pointCount})`,
      );
    } else {
      console.log(
        `[verify-patrol-track-materialize] PASS in ${elapsedMs}ms`,
      );
    }
  } else if (timedOut) {
    console.log(
      `[verify-patrol-track-materialize] FAIL — timed out after ${elapsedMs}ms (last state: ${state})`,
    );
  } else {
    console.log(
      `[verify-patrol-track-materialize] FAIL in ${elapsedMs}ms (state: ${state})`,
    );
  }

  await closeAllQueues();
  await platformPrisma.$disconnect();
  process.exit(passed ? 0 : 1);
}

main().catch(async (err: unknown) => {
  console.error("[verify-patrol-track-materialize] FATAL:", err);
  await closeAllQueues().catch(() => undefined);
  await platformPrisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
