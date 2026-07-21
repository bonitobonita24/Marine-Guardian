#!/usr/bin/env tsx
/**
 * backfill-zone-title-hint.ts
 *
 * ONE-TIME BACKFILL that closes an existing gap in protected-zone (MPA)
 * coverage reporting: a patrol/event whose GPS never entered a zone's
 * polygon, but whose title/caption plainly references the zone (e.g. a
 * patrol titled "Apo Reef Sweep" that stayed outside the drawn boundary),
 * is invisible to that zone's exclusive report even though it plainly
 * covered it.
 *
 * ⚠ THIS IS NOT LIVE PIPELINE LOGIC — AND MUST NEVER BECOME IT ⚠
 *   The live `municipality-assign.processor.ts` covered-zone derivation
 *   stays PURE CONTAINMENT — geometry only. A record whose track/point never
 *   entered a zone polygon is simply not a member of that zone under the
 *   everyday rule. The title-hint stage below exists solely to backfill the
 *   EXISTING historical backlog once. Do not port this into the processor,
 *   and do not add a "fallback" to the live path.
 *
 * WHY A CAPTION-BASED LAST RESORT AT ALL
 *   The owner explicitly approved matching a whitelisted zone name in the
 *   title/notes as a LAST-RESORT signal for the historical backlog only —
 *   mirroring the accepted precedent in
 *   `scripts/backfill-municipality-attribution.ts` (title-hint stage for
 *   municipalities). The whitelist + whole-token matcher live in
 *   `@marine-guardian/shared/lib/zone-attribution` (`matchZoneTitleHint`).
 *
 * RESOLUTION ORDER
 *   containment (already done by the live processor)
 *     → whitelisted whole-token title hint (PATROLS AND EVENTS)
 *     → left as-is (no fallback beyond title hint for this backfill)
 *
 * GUARD — parent-municipality safety
 *   A zone hint is applied ONLY IF the record's `municipalityId` is either
 *   unset OR matches the zone's `parentMunicipalityId`. This prevents a
 *   stray title mention (e.g. a mis-titled or copy-pasted record) from
 *   attaching a zone membership across municipality lines — a title hint is
 *   trusted only when it is geographically consistent with where the record
 *   already sits.
 *
 * IDEMPOTENT
 *   Every write is a fresh covered-zone junction row guarded by the existing
 *   `@@unique([patrolId, protectedZoneId])` / `@@unique([eventId,
 *   protectedZoneId])` constraint — a record already covering a zone (by
 *   geometry OR a prior title-hint run) is skipped, never duplicated. A
 *   second run reports zero new writes for everything the first run wrote.
 *
 * PROVENANCE — every write is auditable and reversible
 *   Every row this script writes is stamped `source = 'title_hint'` (the
 *   default is `'geometry'`, written only by the live processor). So this
 *   backfill's writes are always findable — and reversible — via:
 *     `WHERE source = 'title_hint'`
 *   on `patrol_covered_zones` / `event_covered_zones`.
 *
 * Usage:
 *   # dry-run (DEFAULT — no writes, ever, unless --execute is passed)
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-zone-title-hint.ts
 *
 *   # live
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/backfill-zone-title-hint.ts --execute
 *
 * Options:
 *   --execute          Perform writes. WITHOUT THIS FLAG THE SCRIPT IS A DRY RUN.
 *   --tenant <id>      Restrict to a single tenant (default: all tenants).
 *   --only <kind>      Restrict to `patrols` or `events` (default: both).
 *   --limit <n>        Cap the number of rows assigned per kind (0 = no cap, default).
 *   --pageSize <n>     Keyset page size (default 500; exposed for testing).
 *   --verbose          Print one line per candidate row.
 *
 * Sibling to backfill-municipality-attribution.ts (same .env.dev loading,
 * same CLI-arg parsing, same platformPrisma access pattern, same
 * dry-run-first discipline).
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
    `[backfill-zone-title-hint] ERROR: .env.dev not found at ${envPath} ` +
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
 * DRY RUN IS THE DEFAULT. Writes require the explicit --execute flag.
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
  console.error(`[backfill-zone-title-hint] ERROR: --limit must be >= 0`);
  process.exit(1);
}
if (!Number.isFinite(pageSize) || pageSize < 1) {
  console.error(`[backfill-zone-title-hint] ERROR: --pageSize must be >= 1`);
  process.exit(1);
}
if (only !== undefined && only !== "patrols" && only !== "events") {
  console.error(`[backfill-zone-title-hint] ERROR: --only must be 'patrols' or 'events'`);
  process.exit(1);
}

const doPatrols = only === undefined || only === "patrols";
const doEvents = only === undefined || only === "events";

// ── 3. Import workspace packages ──────────────────────────────────────────────

import { platformPrisma } from "@marine-guardian/db";
import { matchZoneTitleHint } from "@marine-guardian/shared/lib/zone-attribution";

// ── 4. Constants ──────────────────────────────────────────────────────────────

const TAG = "[backfill-zone-title-hint]";

// ── 5. Counters ───────────────────────────────────────────────────────────────

interface Counters {
  candidates: number;
  assigned: number;
  noTitleMatch: number;
  zoneNotInTenant: number;
  municipalityMismatch: number;
  alreadyMember: number;
}

function newCounters(): Counters {
  return {
    candidates: 0,
    assigned: 0,
    noTitleMatch: 0,
    zoneNotInTenant: 0,
    municipalityMismatch: 0,
    alreadyMember: 0,
  };
}

/** Per-zone-slug assigned tally, shared across both kinds. */
const assignedBySlug = new Map<string, number>();

function bumpSlugTally(slug: string): void {
  assignedBySlug.set(slug, (assignedBySlug.get(slug) ?? 0) + 1);
}

// ── 6. Zone loading ────────────────────────────────────────────────────────────

interface ZoneRow {
  id: string;
  slug: string;
  name: string;
  tenantId: string;
  parentMunicipalityId: string | null;
}

/** Load protected zones per tenant, keyed by slug for O(1) hint resolution. */
async function loadZones(): Promise<Map<string, Map<string, ZoneRow>>> {
  const rows = await platformPrisma.protectedZone.findMany({
    where: { ...(tenantFilter ? { tenantId: tenantFilter } : {}) },
    select: {
      id: true,
      slug: true,
      name: true,
      tenantId: true,
      parentMunicipalityId: true,
    },
  });

  const byTenant = new Map<string, Map<string, ZoneRow>>();
  for (const r of rows) {
    const bySlug = byTenant.get(r.tenantId) ?? new Map<string, ZoneRow>();
    bySlug.set(r.slug, r);
    byTenant.set(r.tenantId, bySlug);
  }
  return byTenant;
}

// ── 7. Patrols ────────────────────────────────────────────────────────────────

interface PatrolCandidate {
  id: string;
  tenantId: string;
  erPatrolId: string;
  title: string | null;
  municipalityId: string | null;
}

async function backfillPatrols(zonesByTenant: Map<string, Map<string, ZoneRow>>): Promise<Counters> {
  const c = newCounters();
  let cursor: string | null = null;
  let assigned = 0;

  for (;;) {
    if (limit > 0 && assigned >= limit) break;

    const page: PatrolCandidate[] = await platformPrisma.patrol.findMany({
      where: {
        deletedAt: null,
        ...(tenantFilter ? { tenantId: tenantFilter } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        erPatrolId: true,
        title: true,
        municipalityId: true,
      },
      orderBy: { id: "asc" },
      take: pageSize,
    });

    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;

    for (const row of page) {
      if (limit > 0 && assigned >= limit) break;
      c.candidates++;

      const hit = matchZoneTitleHint(row.title);
      if (hit == null) {
        c.noTitleMatch++;
        continue;
      }

      const zone = zonesByTenant.get(row.tenantId)?.get(hit.slug);
      if (zone == null) {
        c.zoneNotInTenant++;
        continue;
      }

      // GUARD — a title hint is trusted only when it is geographically
      // consistent with the record's own municipality (or the record has
      // none assigned yet). Prevents cross-municipality zone leakage from a
      // stray/mis-titled record.
      const guardOk =
        row.municipalityId == null || row.municipalityId === zone.parentMunicipalityId;
      if (!guardOk) {
        c.municipalityMismatch++;
        if (verbose) {
          console.log(
            `${TAG}   MUNICIPALITY MISMATCH patrol ${row.erPatrolId} municipalityId=${row.municipalityId} ` +
              `≠ zone "${zone.slug}" parentMunicipalityId=${zone.parentMunicipalityId} — skipped`,
          );
        }
        continue;
      }

      const existing = await platformPrisma.patrolCoveredZone.findUnique({
        where: { patrolId_protectedZoneId: { patrolId: row.id, protectedZoneId: zone.id } },
      });
      if (existing != null) {
        c.alreadyMember++;
        continue;
      }

      if (verbose) {
        console.log(
          `${TAG}   ${isDryRun ? "WOULD ADD" : "ADDED"} patrol ${row.erPatrolId} → ${zone.slug} ` +
            `(title_hint "${hit.hint}")`,
        );
      }

      if (!isDryRun) {
        await platformPrisma.patrolCoveredZone.create({
          data: {
            tenantId: row.tenantId,
            patrolId: row.id,
            protectedZoneId: zone.id,
            source: "title_hint",
          },
        });
      }

      c.assigned++;
      bumpSlugTally(zone.slug);
      assigned++;
    }
  }

  return c;
}

// ── 8. Events ─────────────────────────────────────────────────────────────────

interface EventCandidate {
  id: string;
  tenantId: string;
  erEventId: string;
  title: string | null;
  notesJson: unknown;
  municipalityId: string | null;
}

async function backfillEvents(zonesByTenant: Map<string, Map<string, ZoneRow>>): Promise<Counters> {
  const c = newCounters();
  let cursor: string | null = null;
  let assigned = 0;

  for (;;) {
    if (limit > 0 && assigned >= limit) break;

    const page: EventCandidate[] = await platformPrisma.event.findMany({
      where: {
        ...(tenantFilter ? { tenantId: tenantFilter } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        erEventId: true,
        title: true,
        notesJson: true,
        municipalityId: true,
      },
      orderBy: { id: "asc" },
      take: pageSize,
    });

    if (page.length === 0) break;
    cursor = page[page.length - 1]!.id;

    for (const row of page) {
      if (limit > 0 && assigned >= limit) break;
      c.candidates++;

      // Title first; fall back to the stringified notes payload only when
      // the title itself carries no hint.
      let hit = matchZoneTitleHint(row.title);
      if (hit == null && row.notesJson != null) {
        hit = matchZoneTitleHint(JSON.stringify(row.notesJson));
      }
      if (hit == null) {
        c.noTitleMatch++;
        continue;
      }

      const zone = zonesByTenant.get(row.tenantId)?.get(hit.slug);
      if (zone == null) {
        c.zoneNotInTenant++;
        continue;
      }

      const guardOk =
        row.municipalityId == null || row.municipalityId === zone.parentMunicipalityId;
      if (!guardOk) {
        c.municipalityMismatch++;
        if (verbose) {
          console.log(
            `${TAG}   MUNICIPALITY MISMATCH event ${row.erEventId} municipalityId=${row.municipalityId} ` +
              `≠ zone "${zone.slug}" parentMunicipalityId=${zone.parentMunicipalityId} — skipped`,
          );
        }
        continue;
      }

      const existing = await platformPrisma.eventCoveredZone.findUnique({
        where: { eventId_protectedZoneId: { eventId: row.id, protectedZoneId: zone.id } },
      });
      if (existing != null) {
        c.alreadyMember++;
        continue;
      }

      if (verbose) {
        console.log(
          `${TAG}   ${isDryRun ? "WOULD ADD" : "ADDED"} event ${row.erEventId} → ${zone.slug} ` +
            `(title_hint "${hit.hint}")`,
        );
      }

      if (!isDryRun) {
        await platformPrisma.eventCoveredZone.create({
          data: {
            tenantId: row.tenantId,
            eventId: row.id,
            protectedZoneId: zone.id,
            source: "title_hint",
          },
        });
      }

      c.assigned++;
      bumpSlugTally(zone.slug);
      assigned++;
    }
  }

  return c;
}

// ── 9. Reporting ──────────────────────────────────────────────────────────────

function report(kind: string, c: Counters): void {
  const w = isDryRun ? "would-add" : "added";
  console.log(`${TAG} ──── ${kind} ────`);
  console.log(`${TAG}   candidates scanned                             : ${c.candidates}`);
  console.log(`${TAG}   ${w} covered-zone membership (title_hint)        : ${c.assigned}`);
  console.log(`${TAG}   skipped — no title/notes hint match             : ${c.noTitleMatch}`);
  console.log(`${TAG}   skipped — hinted zone not in tenant             : ${c.zoneNotInTenant}`);
  console.log(`${TAG}   skipped — municipality mismatch (guard)         : ${c.municipalityMismatch}`);
  console.log(`${TAG}   skipped — already a member (geometry or prior)  : ${c.alreadyMember}`);
  console.log("");
}

// ── 10. Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = isDryRun ? "[DRY-RUN]" : "[LIVE]";
  console.log(
    `${TAG} ${mode} tenant=${tenantFilter ?? "ALL"} only=${only ?? "patrols+events"} ` +
      `limit=${limit === 0 ? "none" : String(limit)}`,
  );
  if (isDryRun) {
    console.log(`${TAG} dry-run is the DEFAULT — pass --execute to write.`);
  }
  console.log("");

  const zonesByTenant = await loadZones();
  const totalZones = [...zonesByTenant.values()].reduce((n, m) => n + m.size, 0);
  console.log(
    `${TAG} loaded ${totalZones} protected zone(s) across ${zonesByTenant.size} tenant(s)`,
  );
  console.log("");

  if (doPatrols) {
    const c = await backfillPatrols(zonesByTenant);
    report("PATROLS", c);
  }
  if (doEvents) {
    const c = await backfillEvents(zonesByTenant);
    report("EVENTS", c);
  }

  if (assignedBySlug.size > 0) {
    console.log(`${TAG} per-zone tally (title_hint ${isDryRun ? "would-add" : "added"}):`);
    for (const [slug, n] of [...assignedBySlug.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${TAG}   ${slug.padEnd(28)} : ${n}`);
    }
    console.log("");
  }

  console.log(
    `${TAG} PROVENANCE: every written row is stamped source = 'title_hint' on\n` +
      `${TAG}             patrol_covered_zones / event_covered_zones (the live processor\n` +
      `${TAG}             always writes 'geometry') — so this backfill's writes are\n` +
      `${TAG}             findable and reversible via WHERE source = 'title_hint'.\n` +
      `${TAG} GUARD: a title hint is applied ONLY when the record's municipalityId is\n` +
      `${TAG}             unset or matches the hinted zone's parentMunicipalityId —\n` +
      `${TAG}             cross-municipality zone leakage from a stray title is refused.\n` +
      `${TAG} LIVE PIPELINE UNCHANGED: municipality-assign.processor.ts covered-zone\n` +
      `${TAG}             derivation stays pure containment (geometry only).`,
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
