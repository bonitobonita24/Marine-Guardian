#!/usr/bin/env tsx
/**
 * verify-area-rederive.ts
 *
 * Live-verify the area-rederive BullMQ pipeline end-to-end:
 *   enqueueAreaRederive → Valkey → worker → Postgres update
 *
 * Usage:
 *   pnpm tsx scripts/verify-area-rederive.ts [options]
 *
 * Options:
 *   --tenantId <id>      (default: cmoruubw20000gmx3jx7zudmy — demo-site)
 *   --entity <type>      event | patrol | fuelEntry  (default: event)
 *   --id <id>            entity row id  (default: first seed event)
 *   --timeout-ms <ms>    poll timeout   (default: 30000)
 *
 * Template for PatrolTrack Materialization harness — same structure,
 * swap enqueueAreaRederive → enqueuePatrolTrackMaterialize + poll field.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 1. Load .env.dev (no dotenv dep) ──────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");

if (!fs.existsSync(envPath)) {
  console.error(`[verify-area-rederive] ERROR: .env.dev not found at ${envPath}`);
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
const entity = getArg("--entity", "event") as "event" | "patrol" | "fuelEntry";
const id = getArg("--id", "cmpqv0d59001cgmgs23wrfy08");
const timeoutMs = parseInt(getArg("--timeout-ms", "30000"), 10);

const validEntities = ["event", "patrol", "fuelEntry"] as const;
if (!validEntities.includes(entity)) {
  console.error(`[verify-area-rederive] ERROR: --entity must be one of: ${validEntities.join(", ")}`);
  process.exit(1);
}

// ── 3. Import workspace packages ─────────────────────────────────────────
// Imports are resolved at module load time; env vars set above are already
// in process.env by the time these modules initialise their Redis/Prisma clients.

import {
  enqueueAreaRederive,
  closeAllQueues,
} from "@marine-guardian/jobs";
import { platformPrisma } from "@marine-guardian/db";

// ── 4. Snapshot helpers ───────────────────────────────────────────────────

interface EventLike {
  areaBoundaryId: string | null;
  areaDerivedAt: Date | null;
  areaName: string | null;
}

interface FuelEntryLike {
  areaBoundaryId: string | null;
  areaName: string | null;
}

type Snapshot = EventLike | FuelEntryLike;

async function fetchSnapshot(): Promise<Snapshot> {
  if (entity === "event") {
    const row = await platformPrisma.event.findUnique({
      where: { id },
      select: { areaBoundaryId: true, areaDerivedAt: true, areaName: true },
    });
    if (!row) throw new Error(`Event not found: ${id}`);
    return row;
  }
  if (entity === "patrol") {
    const row = await platformPrisma.patrol.findUnique({
      where: { id },
      select: { areaBoundaryId: true, areaDerivedAt: true, areaName: true },
    });
    if (!row) throw new Error(`Patrol not found: ${id}`);
    return row;
  }
  // fuelEntry
  const row = await platformPrisma.fuelEntry.findUnique({
    where: { id },
    select: { areaBoundaryId: true, areaName: true },
  });
  if (!row) throw new Error(`FuelEntry not found: ${id}`);
  return row;
}

function fmtSnapshot(snap: Snapshot): string {
  if ("areaDerivedAt" in snap) {
    return `areaBoundaryId=${snap.areaBoundaryId ?? "null"} areaName="${snap.areaName ?? ""}" areaDerivedAt=${snap.areaDerivedAt?.toISOString() ?? "null"}`;
  }
  return `areaBoundaryId=${snap.areaBoundaryId ?? "null"} areaName="${snap.areaName ?? ""}"`;
}

function hasChanged(before: Snapshot, after: Snapshot): boolean {
  if ("areaDerivedAt" in before && "areaDerivedAt" in after) {
    // event / patrol: pass when areaDerivedAt becomes non-null or changes
    if (after.areaDerivedAt !== null) {
      const beforeTs = "areaDerivedAt" in before ? before.areaDerivedAt?.toISOString() : undefined;
      const afterTs = after.areaDerivedAt.toISOString();
      return afterTs !== beforeTs;
    }
    return false;
  }
  // fuelEntry: pass when areaBoundaryId changes
  return after.areaBoundaryId !== before.areaBoundaryId;
}

// ── 5. Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[verify-area-rederive] entity=${entity} id=${id} tenantId=${tenantId} timeout=${timeoutMs}ms`);

  const before = await fetchSnapshot();
  console.log(`[verify-area-rederive] BEFORE: ${fmtSnapshot(before)}`);

  const jobId = await enqueueAreaRederive({ tenantId, userId: "system", entity, id });
  console.log(`[verify-area-rederive] enqueued jobId=${jobId}`);

  const startMs = Date.now();
  let after: Snapshot = before;
  let passed = false;

  while (Date.now() - startMs < timeoutMs) {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    after = await fetchSnapshot();
    if (hasChanged(before, after)) {
      passed = true;
      break;
    }
  }

  const elapsedMs = Date.now() - startMs;
  console.log(`[verify-area-rederive] AFTER:  ${fmtSnapshot(after)}`);

  if (passed) {
    console.log(`[verify-area-rederive] PASS in ${elapsedMs}ms`);
  } else {
    console.log(`[verify-area-rederive] FAIL — timed out after ${elapsedMs}ms`);
  }

  await closeAllQueues();
  await platformPrisma.$disconnect();
  process.exit(passed ? 0 : 1);
}

main().catch(async (err: unknown) => {
  console.error("[verify-area-rederive] FATAL:", err);
  await closeAllQueues().catch(() => undefined);
  await platformPrisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
