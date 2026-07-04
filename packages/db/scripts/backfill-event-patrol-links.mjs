// Offline backfill: derive Event.patrolId from ER data already stored on
// Patrol.erOriginalSnapshot (patrol_segments[].events[].id), for patrols that
// synced BEFORE the event-patrol-link feature existed. Idempotent — safe to
// re-run any number of times (updateMany just re-sets the same patrolId).
//
// Does NOT call EarthRanger. Reads only what's already in Postgres, PLUS a
// local pre-pulled patrol cache file (same one scripts/ingest-earthranger.mjs
// reads offline) as a fallback for patrols whose erOriginalSnapshot is empty
// — e.g. rows loaded into this dev DB via that bulk ingest path rather than
// the live er-sync.processor.ts, before the ops-milestone-1 snapshot column
// existed. No network calls either way.
//
// Usage:  set -a && source .env.dev && set +a && node packages/db/scripts/backfill-event-patrol-links.mjs
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CACHE_DIR = process.env.ER_CACHE_DIR ||
  "/home/me/UbuntuDevFiles/BlueAlliance/apps/Blue-Alliance---EarthRanger-Reporting-Tool/data";
const CACHE_FILE = `${CACHE_DIR}/patrol-cache.json`;

/** @param {unknown} snapshot */
function extractErEventIds(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const segments = /** @type {any} */ (snapshot).patrol_segments;
  if (!Array.isArray(segments)) return [];
  const ids = new Set();
  for (const seg of segments) {
    const events = seg?.events;
    if (!Array.isArray(events)) continue;
    for (const ev of events) {
      if (ev?.id) ids.add(String(ev.id));
    }
  }
  return Array.from(ids);
}

/** Keyed by erPatrolId -> Set<erEventId>, built once from the local cache file (if present). */
function loadCacheFallbackMap() {
  const map = new Map();
  if (!fs.existsSync(CACHE_FILE)) {
    console.log(`(no local patrol cache at ${CACHE_FILE} — skipping fallback source)`);
    return map;
  }
  const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  const entries = Object.values(data.patrols ?? {});
  for (const entry of entries) {
    const erEventIds = extractErEventIds(entry?.patrol);
    if (erEventIds.length > 0) map.set(entry.patrol.id, erEventIds);
  }
  console.log(`Loaded local patrol cache: ${entries.length} patrol(s), ${map.size} with linked events.`);
  return map;
}

async function main() {
  const cacheFallback = loadCacheFallbackMap();

  const patrols = await prisma.patrol.findMany({
    select: { id: true, tenantId: true, erPatrolId: true, erOriginalSnapshot: true },
  });

  console.log(`Scanning ${patrols.length} patrol(s) total...`);

  let patrolsLinked = 0;
  let eventsLinkedTotal = 0;
  let fromSnapshot = 0;
  let fromCacheFallback = 0;

  for (const patrol of patrols) {
    let erEventIds = extractErEventIds(patrol.erOriginalSnapshot);
    if (erEventIds.length > 0) {
      fromSnapshot += 1;
    } else {
      erEventIds = cacheFallback.get(patrol.erPatrolId) ?? [];
      if (erEventIds.length > 0) fromCacheFallback += 1;
    }
    if (erEventIds.length === 0) continue;

    const result = await prisma.event.updateMany({
      where: { tenantId: patrol.tenantId, erEventId: { in: erEventIds } },
      data: { patrolId: patrol.id },
    });

    if (result.count > 0) {
      patrolsLinked += 1;
      eventsLinkedTotal += result.count;
    }
  }

  const totalEventsWithPatrol = await prisma.event.count({
    where: { patrolId: { not: null } },
  });
  const totalPatrolsWithLinkedEvents = await prisma.patrol.count({
    where: { events: { some: {} } },
  });

  console.log("--- Backfill result ---");
  console.log(`patrols matched via erOriginalSnapshot: ${fromSnapshot}`);
  console.log(`patrols matched via local cache fallback: ${fromCacheFallback}`);
  console.log(`patrols that matched >=1 event this run: ${patrolsLinked}`);
  console.log(`event rows updated (updateMany count sum): ${eventsLinkedTotal}`);
  console.log(`TOTAL events with patrolId set (post-backfill):   ${totalEventsWithPatrol}`);
  console.log(`TOTAL distinct patrols with >=1 linked event:     ${totalPatrolsWithLinkedEvents}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
