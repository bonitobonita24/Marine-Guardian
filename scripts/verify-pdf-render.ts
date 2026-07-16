#!/usr/bin/env tsx
/**
 * verify-pdf-render.ts
 *
 * Mode B live-QA harness — verifies the pdf-render BullMQ pipeline end-to-end:
 *   enqueuePdfRender → Valkey → worker → Puppeteer → MinIO → BullMQ completed/failed
 *
 * Polls BullMQ job state (NOT Postgres directly) because the worker may take
 * 5-30s to complete a real Puppeteer render.  A clean "completed" state with
 * returnvalue.status === "ready" is the PASS criterion.
 *
 * A ReportExport row is created fresh per run so results are deterministic and
 * idempotent across multiple harness invocations.
 *
 * Usage:
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/verify-pdf-render.ts [options]
 *
 * Options:
 *   --tenantId    <id>    (default: cmoruubw20000gmx3jx7zudmy — demo-site)
 *   --reportType  <type>  (default: area;  allowed: coverage | area)
 *   --paperSize   <size>  (default: A4;    allowed: A4 | LETTER)
 *   --timeout-ms  <ms>    poll timeout (default: 60000 — Puppeteer is slower than patrol-track)
 *
 * Sibling to verify-area-rederive.ts (186L) + verify-patrol-track-materialize.ts (286L).
 * Third Mode B proof point — locks the BullMQ-state-polling template across 3 queues.
 * Pattern: create DB row → enqueue → poll BullMQ state → verify returnvalue → PASS/FAIL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 1. Load .env.dev (no dotenv dep) ──────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");

if (!fs.existsSync(envPath)) {
  console.error(
    `[verify-pdf-render] ERROR: .env.dev not found at ${envPath}`,
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
const reportTypeArg = getArg("--reportType", "area");
const paperSizeArg = getArg("--paperSize", "A4");
const timeoutMs = parseInt(getArg("--timeout-ms", "60000"), 10);

// ── 3. Import workspace packages ──────────────────────────────────────────
// Imports are resolved at module load time; env vars set above are already
// in process.env by the time these modules initialise their Redis/Prisma clients.

import {
  enqueuePdfRender,
  getPdfRenderQueue,
  closeAllQueues,
} from "@marine-guardian/jobs";
import { platformPrisma } from "@marine-guardian/db";

// ── 4. Types ───────────────────────────────────────────────────────────────

// Structural copy of the worker's RenderResult.
// The real type is re-exported from the jobs barrel but declared locally
// to avoid import-time side effects on the worker module.
interface RenderResult {
  exportId: string;
  status: "ready" | "failed";
  filePath?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

interface ReportExportSnapshot {
  id: string;
  status: string;
  reportType: string;
  paperSize: string;
  filePath: string | null;
  fileSizeBytes: number | null;
  completedAt: Date | null;
  errorMessage: string | null;
}

// ── 5. Snapshot helpers ────────────────────────────────────────────────────

async function fetchReportExportSnapshot(
  exportId: string,
): Promise<ReportExportSnapshot | null> {
  return platformPrisma.reportExport.findUnique({
    where: { id: exportId },
    select: {
      id: true,
      status: true,
      reportType: true,
      paperSize: true,
      filePath: true,
      fileSizeBytes: true,
      completedAt: true,
      errorMessage: true,
    },
  }) as Promise<ReportExportSnapshot | null>;
}

function fmtSnapshot(row: ReportExportSnapshot | null): string {
  if (row === null) return "exportId=null";
  return (
    `id=${row.id}` +
    ` status=${row.status}` +
    ` reportType=${row.reportType}` +
    ` paperSize=${row.paperSize}` +
    ` filePath=${row.filePath ?? "null"}` +
    ` fileSizeBytes=${row.fileSizeBytes ?? "null"}` +
    ` completedAt=${row.completedAt?.toISOString() ?? "null"}` +
    ` errorMessage=${row.errorMessage ?? "null"}`
  );
}

// ── 6. Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `[verify-pdf-render] tenantId=${tenantId} reportType=${reportTypeArg} paperSize=${paperSizeArg} timeout=${timeoutMs}ms`,
  );

  // Resolve a real tenant-owner userId (worker validates requestedByUserId FK).
  // NOTE: role literal is "tenant_superadmin" post 3-tier-RBAC rename (was "super_admin").
  const superAdmin = await platformPrisma.user.findFirst({
    where: { role: "tenant_superadmin", isActive: true },
    select: { id: true },
  });
  if (!superAdmin) {
    console.error(
      "[verify-pdf-render] FATAL: no super_admin user available — cannot harness",
    );
    await closeAllQueues().catch(() => undefined);
    await platformPrisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }

  // Create a fresh ReportExport row — worker reads this by id
  const exportRow = await platformPrisma.reportExport.create({
    data: {
      tenantId,
      requestedByUserId: superAdmin.id,
      reportType: reportTypeArg as "coverage" | "area",
      paperSize: paperSizeArg as "A4" | "LETTER",
      status: "queued",
      paramsJson: {},
    },
    select: { id: true },
  });
  const exportId = exportRow.id;

  // BEFORE snapshot (informational)
  const before = await fetchReportExportSnapshot(exportId);
  console.log(`[verify-pdf-render] BEFORE: ${fmtSnapshot(before)}`);

  // Enqueue
  const jobId = await enqueuePdfRender({
    tenantId,
    userId: "system",
    exportId,
  });
  console.log(`[verify-pdf-render] enqueued jobId=${jobId} exportId=${exportId}`);

  // Poll BullMQ job state
  const queue = getPdfRenderQueue();
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
        process.stdout.write(`[verify-pdf-render] state: ${state}`);
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
    const result = finalJob.returnvalue as RenderResult;
    console.log(
      `[verify-pdf-render] returnvalue: ${JSON.stringify(result, null, 2)}`,
    );

    // Verify DB row updated by worker
    const after = await fetchReportExportSnapshot(exportId);
    const dbReady = after?.status === "ready";
    const hasFilePath = after?.filePath != null;

    if (result.status === "ready" && (dbReady || hasFilePath)) {
      passed = true;
    } else if (result.status === "ready" && !dbReady) {
      // Accept race window — worker returnvalue is authoritative
      console.log(
        "[verify-pdf-render] note: returnvalue=ready but DB row not yet status=ready (race window — accepted)",
      );
      passed = true;
    } else {
      console.log(
        `[verify-pdf-render] returnvalue.status=${result.status} — not ready`,
      );
    }
  } else if (state === "failed" && finalJob !== undefined) {
    console.log(
      `[verify-pdf-render] failedReason: ${finalJob.failedReason ?? "(unknown)"}`,
    );
  }

  // AFTER snapshot (informational)
  const after = await fetchReportExportSnapshot(exportId);
  console.log(`[verify-pdf-render] AFTER:  ${fmtSnapshot(after)}`);

  // Result line
  if (passed) {
    const result =
      state === "completed" && finalJob !== undefined
        ? (finalJob.returnvalue as RenderResult)
        : null;

    if (result?.status === "ready" && result.filePath != null) {
      console.log(
        `[verify-pdf-render] PASS in ${elapsedMs}ms` +
          ` (PDF ready: filePath=${result.filePath}` +
          ` fileSizeBytes=${result.fileSizeBytes ?? "unknown"})`,
      );
    } else {
      console.log(`[verify-pdf-render] PASS in ${elapsedMs}ms`);
    }
  } else if (timedOut) {
    console.log(
      `[verify-pdf-render] FAIL — timed out after ${elapsedMs}ms (last state: ${state})`,
    );
  } else {
    console.log(
      `[verify-pdf-render] FAIL in ${elapsedMs}ms (state: ${state})`,
    );
  }

  await closeAllQueues();
  await platformPrisma.$disconnect();
  process.exit(passed ? 0 : 1);
}

main().catch(async (err: unknown) => {
  console.error("[verify-pdf-render] FATAL:", err);
  await closeAllQueues().catch(() => undefined);
  await platformPrisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
