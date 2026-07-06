/**
 * relink-skylight-entry-alerts.ts
 *
 * One-shot backfill for T2 (2026-07-06). Fixes existing events that were
 * synced with `event_type_id = NULL` because the live ER-sync processor
 * (er-sync.processor.ts syncEvents) never resolved an event's ER
 * `event_type` value to the EventType catalog at all — see
 * packages/jobs/src/lib/resolve-event-type.ts for the full root-cause
 * writeup. That gap is now fixed for all FUTURE syncs; this script re-links
 * the events that were already ingested with the bug.
 *
 * Scope: ANY event with `eventTypeId IS NULL` whose immutable
 * `erOriginalSnapshot->>'event_type'` value now matches a row in this
 * tenant's EventType catalog (upserted by the recurring `event_types` sync
 * job). Not hardcoded to `entry_alert_rep` — it fixes every null-typed
 * event the catalog can resolve, including the ~102 Skylight
 * "entry_alert_rep" AOI-visit events (which will start displaying as
 * "Skylight Entry Alert" and become subject to the T1 includeSkylight
 * toggle) and any other stragglers (e.g. `communitysupport`).
 *
 * Deliberately does NOT touch `state` — these events were already resolved
 * by a prior manual resolve-all pass; this script only fixes the type link.
 *
 * Usage (from monorepo root):
 *   DATABASE_URL=... npx tsx scripts/relink-skylight-entry-alerts.ts
 *   DATABASE_URL=... npx tsx scripts/relink-skylight-entry-alerts.ts --tenant <tenantId>
 *
 * Or with the dev env:
 *   source .env.dev && npx tsx scripts/relink-skylight-entry-alerts.ts
 *
 * Safe to re-run (idempotent): only matches rows still missing an
 * eventTypeId; already-linked events are left untouched.
 */

import { PrismaClient } from "@prisma/client";
import { resolveEventType } from "../packages/jobs/src/lib/resolve-event-type.js";

const prisma = new PrismaClient();

const tenantIdx = process.argv.indexOf("--tenant");
const TENANT_ID = tenantIdx !== -1 ? process.argv[tenantIdx + 1] : undefined;

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: TENANT_ID ? { id: TENANT_ID } : {},
    select: { id: true, slug: true },
  });
  console.log(`[relink-skylight-entry-alerts] ${String(tenants.length)} tenant(s) found.`);

  let totalRelinked = 0;
  let totalUnresolvable = 0;

  for (const tenant of tenants) {
    console.log(`\n[relink-skylight-entry-alerts] Tenant: ${tenant.slug}`);

    const nullTypedEvents = await prisma.event.findMany({
      where: { tenantId: tenant.id, eventTypeId: null },
      select: { id: true, title: true, erOriginalSnapshot: true },
    });

    console.log(`  Null-typed events to evaluate: ${String(nullTypedEvents.length)}`);

    let relinked = 0;
    let unresolvable = 0;
    const byErEventType = new Map<string, number>();

    for (const event of nullTypedEvents) {
      const snapshot = event.erOriginalSnapshot as { event_type?: string } | null;
      const erEventType = snapshot?.event_type;

      const resolved = await resolveEventType(prisma, tenant.id, erEventType);
      if (resolved.eventTypeId === null) {
        unresolvable++;
        continue;
      }

      await prisma.event.update({
        where: { id: event.id },
        data: { eventTypeId: resolved.eventTypeId },
      });
      relinked++;

      const key = erEventType ?? "(none)";
      byErEventType.set(key, (byErEventType.get(key) ?? 0) + 1);
    }

    console.log(`  Relinked: ${String(relinked)}, unresolvable (no catalog match): ${String(unresolvable)}`);
    for (const [erEventType, count] of byErEventType) {
      console.log(`    - ${erEventType}: ${String(count)}`);
    }

    totalRelinked += relinked;
    totalUnresolvable += unresolvable;
  }

  console.log(
    `\n[relink-skylight-entry-alerts] Done. Total relinked: ${String(totalRelinked)}, total unresolvable: ${String(totalUnresolvable)}.`,
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
