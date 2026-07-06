/**
 * reconcile-patrol-state-and-segments.ts
 *
 * Reusable reconciliation script for the 2026-07-07 Command Center roster
 * mis-attribution bug (root cause: packages/jobs/src/processors/er-sync.processor.ts
 * syncPatrols had two defects — see that file's inline comments for the full
 * writeup):
 *
 *   Defect A — patrol_segments were NEVER written by the live sync, so the
 *   segment leader (leaderErId/leaderName), which the Command Center roster
 *   (dashboard.ts rangerRoster) uses to compute `on_patrol`, only ever existed
 *   for patrols run through the one-off scripts/ingest-earthranger.mjs backfill.
 *
 *   Defect B — a patrol that finished in ER but whose `updated_at` bump fell
 *   outside a given incremental `?updated_since=` sync window stayed
 *   `state=open` in our DB forever, so its leader kept wrongly showing as
 *   ON PATROL.
 *
 * Both defects are now fixed in the LIVE sync path (syncPatrols) going
 * forward. This script is the one-shot (and safe-to-repeat) reconciliation
 * pass for patrols that were already synced under the old, buggy behavior —
 * run it any time roster drift is suspected, not just once.
 *
 * For every non-deleted Patrol with state='open' and a non-null erPatrolId,
 * this script:
 *   1. Fetches the current patrol record directly from EarthRanger by id
 *      (GET /activity/patrols/{id}/ via EarthRangerClient.getPatrolById —
 *      bypasses the `?updated_since=` window entirely, so it always sees
 *      ER's current truth regardless of when it last "updated").
 *   2. If ER reports the patrol as ended — p.state is "done"/"cancelled", OR
 *      it has segments and EVERY segment has a time_range.end_time — updates
 *      our row's state (+ endTime, when derivable) to match.
 *   3. Upserts patrol_segments for that patrol using the exact same field
 *      mapping as the live sync (packages/jobs/src/processors/er-sync.processor.ts
 *      syncPatrols), keyed on the @@unique([patrolId, erSegmentId]) constraint —
 *      so this script and the live sync can never diverge in shape.
 *
 * Idempotent + safe to re-run: an already-reconciled patrol (state matches ER,
 * segments already upserted with current values) is simply re-written to the
 * same values. All-tenant by default; pass --tenant to scope to one tenant.
 *
 * Usage (from monorepo root):
 *   DATABASE_URL=... npx tsx scripts/reconcile-patrol-state-and-segments.ts
 *   DATABASE_URL=... npx tsx scripts/reconcile-patrol-state-and-segments.ts --tenant <tenantId>
 *
 * Or with the dev env:
 *   source .env.dev && npx tsx scripts/reconcile-patrol-state-and-segments.ts
 *
 * ER connection credentials: by default this script reads the SAME canonical
 * TenantErConnection table (baseUrl + apiTokenEnc, decrypted via the shared
 * `decrypt` helper) that the live er-sync.processor.ts reads — see that
 * file's `processErSync` for the identical lookup. This means no extra
 * configuration is needed for any tenant that already has a working ER
 * connection saved via the Settings UI.
 *
 * FALLBACK: if a tenant has no TenantErConnection row (e.g. running this
 * against a bare DB dump, or a tenant configured outside the UI), set:
 *   ER_BASE_URL=https://<site>.pamdas.org DAS_WEB_TOKEN=<bearer-token> \
 *     npx tsx scripts/reconcile-patrol-state-and-segments.ts --tenant <tenantId>
 * The env fallback is used for ANY tenant missing a TenantErConnection row,
 * and applies the SAME base URL + token to every such tenant — only correct
 * for a single-ER-instance environment. Multi-tenant, multi-ER-instance
 * setups MUST have a TenantErConnection row per tenant.
 */

import { PrismaClient, PatrolState } from "@prisma/client";
import { decrypt } from "@marine-guardian/db";
import { EarthRangerClient } from "../packages/jobs/src/lib/earthranger-client.js";

const prisma = new PrismaClient();

const tenantIdx = process.argv.indexOf("--tenant");
const TENANT_ID = tenantIdx !== -1 ? process.argv[tenantIdx + 1] : undefined;

const ENV_ER_BASE_URL = process.env.ER_BASE_URL;
const ENV_DAS_WEB_TOKEN = process.env.DAS_WEB_TOKEN;

async function getClientForTenant(tenantId: string): Promise<EarthRangerClient | null> {
  const conn = await prisma.tenantErConnection.findUnique({
    where: { tenantId },
    select: { baseUrl: true, apiTokenEnc: true },
  });

  if (conn != null) {
    return new EarthRangerClient(conn.baseUrl, decrypt(conn.apiTokenEnc));
  }

  if (ENV_ER_BASE_URL != null && ENV_DAS_WEB_TOKEN != null) {
    console.warn(
      `  [reconcile] Tenant ${tenantId} has no TenantErConnection row — falling back to ER_BASE_URL/DAS_WEB_TOKEN env.`,
    );
    return new EarthRangerClient(ENV_ER_BASE_URL, ENV_DAS_WEB_TOKEN);
  }

  console.warn(
    `  [reconcile] Skipping tenant ${tenantId}: no TenantErConnection row and no ER_BASE_URL/DAS_WEB_TOKEN env fallback set.`,
  );
  return null;
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: TENANT_ID ? { id: TENANT_ID } : {},
    select: { id: true, slug: true },
  });
  console.log(`[reconcile-patrol-state-and-segments] ${String(tenants.length)} tenant(s) found.`);

  let totalPatrolsChecked = 0;
  let totalPatrolsClosed = 0;
  let totalSegmentsUpserted = 0;
  let totalUnresolvable = 0;

  for (const tenant of tenants) {
    console.log(`\n[reconcile-patrol-state-and-segments] Tenant: ${tenant.slug}`);

    const client = await getClientForTenant(tenant.id);
    if (client == null) {
      continue;
    }

    // erPatrolId is a non-nullable column (every Patrol row is ER-sourced),
    // so no extra "has an erPatrolId" filter is needed beyond state+isDeleted.
    const openPatrols = await prisma.patrol.findMany({
      where: { tenantId: tenant.id, state: PatrolState.open, isDeleted: false },
      select: { id: true, erPatrolId: true, title: true },
    });

    console.log(`  Open patrols to check: ${String(openPatrols.length)}`);

    let closed = 0;
    let segmentsUpserted = 0;
    let unresolvable = 0;

    for (const patrol of openPatrols) {
      totalPatrolsChecked++;

      let erPatrol;
      try {
        erPatrol = await client.getPatrolById(patrol.erPatrolId);
      } catch (err) {
        unresolvable++;
        console.error(
          `    [reconcile] Failed to fetch ER patrol ${patrol.erPatrolId} (${patrol.title ?? "untitled"}):`,
          err instanceof Error ? err.message : String(err),
        );
        continue;
      }

      const segments = erPatrol.patrol_segments ?? [];
      const now = new Date();

      // Same mapping as syncPatrols in er-sync.processor.ts — keep in sync.
      for (const seg of segments) {
        const segStart = seg.time_range?.start_time;
        const segEnd = seg.time_range?.end_time;
        await prisma.patrolSegment.upsert({
          where: {
            patrolId_erSegmentId: { patrolId: patrol.id, erSegmentId: seg.id },
          },
          create: {
            patrolId: patrol.id,
            erSegmentId: seg.id,
            scheduledStart: seg.scheduled_start != null ? new Date(seg.scheduled_start) : null,
            scheduledEnd: seg.scheduled_end != null ? new Date(seg.scheduled_end) : null,
            actualStart: segStart != null ? new Date(segStart) : null,
            actualEnd: segEnd != null ? new Date(segEnd) : null,
            leaderName: seg.leader?.name ?? null,
            leaderErId: seg.leader?.id ?? null,
            syncedAt: now,
          },
          update: {
            scheduledStart: seg.scheduled_start != null ? new Date(seg.scheduled_start) : null,
            scheduledEnd: seg.scheduled_end != null ? new Date(seg.scheduled_end) : null,
            actualStart: segStart != null ? new Date(segStart) : null,
            actualEnd: segEnd != null ? new Date(segEnd) : null,
            leaderName: seg.leader?.name ?? null,
            leaderErId: seg.leader?.id ?? null,
            syncedAt: now,
          },
        });
        segmentsUpserted++;
      }

      // Same "is this patrol actually done" derivation as syncPatrols.
      const allSegmentsEnded =
        segments.length > 0 && segments.every((s) => s.time_range?.end_time != null);
      const erIsClosed =
        erPatrol.state === "done" ||
        erPatrol.state === "cancelled" ||
        allSegmentsEnded;

      if (erIsClosed) {
        const nextState =
          erPatrol.state === "cancelled" ? PatrolState.cancelled : PatrolState.done;
        const lastSeg = segments[segments.length - 1];
        const derivedEndTime =
          erPatrol.end_time != null
            ? new Date(erPatrol.end_time)
            : lastSeg?.time_range?.end_time != null
              ? new Date(lastSeg.time_range.end_time)
              : null;

        await prisma.patrol.update({
          where: { id: patrol.id },
          data: {
            state: nextState,
            ...(derivedEndTime != null ? { endTime: derivedEndTime } : {}),
          },
        });
        closed++;
        console.log(
          `    Closed patrol ${patrol.id} (${patrol.title ?? "untitled"}) → ${nextState}`,
        );
      }
    }

    console.log(
      `  Patrols closed: ${String(closed)}, segments upserted: ${String(segmentsUpserted)}, unresolvable: ${String(unresolvable)}`,
    );

    totalPatrolsClosed += closed;
    totalSegmentsUpserted += segmentsUpserted;
    totalUnresolvable += unresolvable;
  }

  console.log(
    `\n[reconcile-patrol-state-and-segments] Done. Checked: ${String(totalPatrolsChecked)}, closed: ${String(totalPatrolsClosed)}, segments upserted: ${String(totalSegmentsUpserted)}, unresolvable: ${String(totalUnresolvable)}.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
