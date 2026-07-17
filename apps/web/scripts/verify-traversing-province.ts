#!/usr/bin/env tsx
/**
 * verify-traversing-province.ts
 *
 * LIVE, real-dev-data reconciliation of the province-level traversing-patrols
 * feature (e5850ad). Confirms the invariant the mocked unit tests can only
 * assert against fixtures: on REAL municipality geometry + REAL patrol tracks,
 * the MAP-OVERLAY traversing total and the REPORT-SUMMARY traversing total are
 * the same number — computed by two independent implementations:
 *
 *   • MAP OVERLAY  → reportMap.summary folds in `sumTraversingCoverageAcross`
 *                    (apps/web/src/server/reporting/traversing-coverage.ts)
 *   • REPORT PAGE  → getReportMapReportData().traversingPatrols.total, built by
 *                    `buildTraversingPatrols`
 *                    (apps/web/src/server/report-map-report/get-report-map-report-data.ts)
 *
 * Both are exercised through their PUBLIC entry points on the same province
 * scope + window; PASS iff total km + hours reconcile within epsilon. A
 * throwaway report_exports row is created and deleted per run (no product edit).
 *
 * Usage (from apps/web so @/ tsconfig paths resolve):
 *   pnpm exec tsx scripts/verify-traversing-province.ts \
 *     [--tenantId <id>] [--slug <slug>] [--province "<name>"]
 *
 * Defaults: dev ph tenant, slug "ph", province "Oriental Mindoro".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 1. Load .env.dev (no dotenv dep) — repo root is 3 dirs up from apps/web/scripts ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env.dev");
if (!fs.existsSync(envPath)) {
  console.error(`[verify-traversing-province] ERROR: .env.dev not found at ${envPath}`);
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (key.length > 0 && process.env[key] === undefined) process.env[key] = val;
}

// ── 2. CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string, fallback: string): string => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] !== undefined ? (args[idx + 1] as string) : fallback;
};
const tenantId = getArg("--tenantId", "cmoruubw20000gmx3jx7zudmy");
const tenantSlug = getArg("--slug", "ph");
const province = getArg("--province", "Oriental Mindoro");

// ── 3. Imports (env is already in process.env before Prisma initialises) ──────
import { prisma } from "@marine-guardian/db";
import { resolveMunicipalityScope } from "@/server/reporting/municipality-scope";
import { sumTraversingCoverageAcross } from "@/server/reporting/traversing-coverage";
import { getReportMapReportData } from "@/server/report-map-report/get-report-map-report-data";

const P = "[verify-traversing-province]";
const fmt = (n: number) => n.toFixed(4);

async function main(): Promise<void> {
  console.log(`${P} tenant=${tenantId} slug=${tenantSlug} province="${province}"`);

  // Resolve the province's member municipalities (same resolver the router uses).
  const memberIds = await resolveMunicipalityScope(tenantId, { province });
  if (!memberIds || memberIds.length === 0) {
    console.error(`${P} FAIL: province "${province}" resolved to 0 municipalities`);
    process.exit(1);
  }
  console.log(`${P} resolved ${String(memberIds.length)} member municipalities`);

  // ── MAP-OVERLAY path: the exact primitive reportMap.summary folds in ──
  // All-time window (undefined from/to) so both sides see identical data.
  const overlay = await sumTraversingCoverageAcross(tenantId, {}, memberIds);
  console.log(`${P} OVERLAY  (sumTraversingCoverageAcross): km=${fmt(overlay.km)} hours=${fmt(overlay.hours)}`);

  // ── REPORT-PAGE path: getReportMapReportData().traversingPatrols.total ──
  const someUser = await prisma.user.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (!someUser) {
    console.error(`${P} FAIL: no user in tenant ${tenantId} to attribute the export row`);
    process.exit(1);
  }

  const exportRow = await prisma.reportExport.create({
    data: {
      tenantId,
      requestedByUserId: someUser.id,
      reportType: "report_map",
      paramsJson: { province, includeTraversing: true },
    },
    select: { id: true },
  });

  let report;
  try {
    report = await getReportMapReportData(tenantSlug, exportRow.id);
  } finally {
    await prisma.reportExport.delete({ where: { id: exportRow.id } });
    console.log(`${P} cleaned up throwaway export row ${exportRow.id}`);
  }

  if (!report) {
    console.error(`${P} FAIL: getReportMapReportData returned null (tenant/export/type guard)`);
    process.exit(1);
  }
  const tp = report.traversingPatrols;
  if (!tp) {
    console.error(`${P} FAIL: traversingPatrols undefined — province scope did not resolve to members in the report path`);
    process.exit(1);
  }
  console.log(
    `${P} REPORT   (traversingPatrols.total): insideKm=${fmt(tp.total.insideKm)} ` +
      `insideHoursEst=${fmt(tp.total.insideHoursEst)} rows=${String(tp.rows.length)} ` +
      `(foot=${String(tp.foot.count)} seaborne=${String(tp.seaborne.count)})`,
  );

  // ── Reconcile ──
  const EPS = 1e-3; // sub-metre / sub-second — clip math is deterministic, so this is tight
  const dKm = Math.abs(overlay.km - tp.total.insideKm);
  const dHours = Math.abs(overlay.hours - tp.total.insideHoursEst);
  const kmOk = dKm <= EPS;
  const hoursOk = dHours <= EPS;

  console.log(`${P} Δkm=${fmt(dKm)} Δhours=${fmt(dHours)} (eps=${String(EPS)})`);

  // Guard against a vacuous pass (both zero would "reconcile" but prove nothing).
  if (overlay.km === 0 && tp.total.insideKm === 0) {
    console.warn(
      `${P} WARNING: both totals are ZERO — no traversing patrols found in "${province}". ` +
        `Reconciliation is vacuous; pick a province/window with cross-boundary patrols.`,
    );
  }

  if (kmOk && hoursOk) {
    console.log(`${P} ✅ PASS: overlay total == report summary total on real dev data`);
    process.exit(0);
  } else {
    console.error(
      `${P} ❌ FAIL: overlay total and report summary total DIVERGE (kmOk=${String(kmOk)} hoursOk=${String(hoursOk)})`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(`${P} FATAL:`, err);
  process.exit(1);
});
