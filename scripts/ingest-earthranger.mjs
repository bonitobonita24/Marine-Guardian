#!/usr/bin/env node
/**
 * EarthRanger -> Marine-Guardian DEV ingestion (idempotent upserts).
 *
 * Pulls REAL data from mindoro.pamdas.org (live API) + the pre-pulled
 * patrol cache, and loads it into the MG dev DB attached to the existing
 * Demo Site tenant (admin@mail.com).
 *
 * Runs newest -> oldest, checkpointing after every page so the DB always
 * holds the newest data first.
 *
 * Usage (from packages/db so @prisma/client resolves):
 *   cd packages/db
 *   DATABASE_URL=... node ../../scripts/ingest-earthranger.mjs [--events-pages=N] [--no-events] [--no-patrols] [--no-subjects] [--patrol-limit=N]
 *
 * Auth: uses DAS_WEB_TOKEN bearer (verified working; ER_TRACK_TOKEN is expired).
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve @prisma/client from packages/db (pnpm hoists it there, not at scripts/).
const __dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dir, "..", "packages", "db", "package.json"));
const { PrismaClient } = require("@prisma/client");

// ---- config ----
const ER_BASE = (process.env.ER_BASE_URL || "https://mindoro.pamdas.org").replace(/\/$/, "") + "/api/v1.0";
const ER_TOKEN = process.env.DAS_WEB_TOKEN || process.env.ER_TOKEN;
const CACHE_DIR = process.env.ER_CACHE_DIR ||
  "/home/me/UbuntuDevFiles/BlueAlliance/apps/Blue-Alliance---EarthRanger-Reporting-Tool/data";
const TENANT_ID = process.env.MG_TENANT_ID || "cmoruubw20000gmx3jx7zudmy"; // Demo Site

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const EVENTS_PAGES = args["events-pages"] ? Number(args["events-pages"]) : Infinity;
const PATROL_LIMIT = args["patrol-limit"] ? Number(args["patrol-limit"]) : Infinity;
const DO_EVENTS = !args["no-events"];
const DO_PATROLS = !args["no-patrols"];
const DO_SUBJECTS = !args["no-subjects"];
const PAGE_SIZE = Number(args["page-size"] || 200);
// Patrol source: "cache" (default, pre-pulled snapshot) or "api" (live
// /activity/patrols, paginated). Tracks always come from the local cache files
// (the dedicated ER track token is expired), so api-source patrols with no
// cached track file simply have no track row.
const PATROL_SOURCE = args["patrols-source"] || "cache";
const PATROL_PAGE_SIZE = Number(args["patrol-page-size"] || 100);
// Gentle throttle between live patrol pages to avoid hitting ER API limits.
const PATROL_PAGE_DELAY = Number(args["patrol-page-delay-ms"] || 1500);
// Optional incremental backfill: only pull events updated on/after this ISO
// date (e.g. --updated-since=2026-06-25). Newest-first paging stops once it
// walks past the cutoff, so a gap fill doesn't re-page the full 36k feed.
const UPDATED_SINCE = args["updated-since"] || process.env.ER_UPDATED_SINCE || null;

// Skylight automated vessel-detection events (event-type DISPLAY containing
// "skylight", case-insensitive) are ingested like any other event as of
// SKY-1 — mirrors er-sync.processor.ts syncEvents. Skylight stays excluded
// from reports/dashboard/events-list/municipality coverage (unchanged); the
// /map opt-in toggle filters at query time.

const prisma = new PrismaClient();
const now = () => new Date();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- ER fetch with backoff ----
async function erGet(pathOrUrl, attempt = 0) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : ER_BASE + pathOrUrl;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${ER_TOKEN}`, Accept: "application/json" },
    });
    if (r.status === 429 || r.status >= 500) {
      if (attempt >= 5) throw new Error(`HTTP ${r.status} after retries`);
      const wait = Math.min(2000 * 2 ** attempt, 20000);
      console.warn(`  [backoff] ${r.status} -> wait ${wait}ms`);
      await sleep(wait);
      return erGet(pathOrUrl, attempt + 1);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    return j.data || j; // unwrap DRF data envelope
  } catch (e) {
    if (attempt < 3) {
      await sleep(1500 * (attempt + 1));
      return erGet(pathOrUrl, attempt + 1);
    }
    throw e;
  }
}

// ---- mappers ----
function mapEventState(s) {
  if (!s) return "new_event";
  const v = String(s).toLowerCase();
  if (v === "new" || v === "new_event") return "new_event";
  if (v === "active") return "active";
  if (v === "resolved") return "resolved";
  return "new_event";
}
function mapEventPriority(p) {
  // ER numeric: 0 grey, 100 green, 200 amber, 300 red
  const n = Number(p) || 0;
  if (n >= 300) return "CRITICAL";
  if (n >= 200) return "HIGH";
  if (n >= 100) return "MEDIUM";
  return "LOW";
}
function mapPatrolType(t) {
  const v = String(t || "").toLowerCase();
  if (v.includes("sea") || v.includes("boat") || v.includes("marine") || v.includes("water")) return "seaborne";
  return "foot";
}
function mapPatrolState(s) {
  const v = String(s || "").toLowerCase();
  if (v === "done" || v === "closed") return "done";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  return "open";
}
const d = (x) => (x ? new Date(x) : null);

// ---- stats ----
const stats = { eventTypes: 0, events: 0, subjects: 0, subjectGroups: 0, patrols: 0, segments: 0, tracks: 0, observations: 0 };
let newest = null, oldest = null;
function track(ts) {
  if (!ts) return;
  const t = new Date(ts);
  if (isNaN(t)) return;
  if (!newest || t > newest) newest = t;
  if (!oldest || t < oldest) oldest = t;
}

// ---- EVENT TYPES ----
const eventTypeIdByValue = new Map(); // value -> MG eventType.id
async function ingestEventTypes() {
  let list = [];
  try {
    list = await erGet("/activity/events/eventtypes/");
  } catch (e) {
    console.warn("eventtypes fetch failed, will derive from events:", e.message);
  }
  if (Array.isArray(list)) {
    for (const et of list) {
      const erId = et.id || et.value;
      const cat = typeof et.category === "object" ? (et.category?.value || et.category?.display || null) : (et.category || null);
      const row = await prisma.eventType.upsert({
        where: { tenantId_erEventtypeId: { tenantId: TENANT_ID, erEventtypeId: String(erId) } },
        update: { value: et.value, display: et.display || et.value, category: cat, iconId: et.icon_id || null, schemaJson: et.schema || undefined, syncedAt: now() },
        create: { tenantId: TENANT_ID, erEventtypeId: String(erId), value: et.value, display: et.display || et.value, category: cat, defaultPriority: Number(et.default_priority) || 0, iconId: et.icon_id || null, schemaJson: et.schema || undefined, syncedAt: now() },
      });
      eventTypeIdByValue.set(et.value, row.id);
      stats.eventTypes++;
    }
  }
  console.log(`[eventTypes] ${stats.eventTypes} upserted`);
}

async function ensureEventType(value, display) {
  if (!value) return null;
  if (eventTypeIdByValue.has(value)) return eventTypeIdByValue.get(value);
  const row = await prisma.eventType.upsert({
    where: { tenantId_erEventtypeId: { tenantId: TENANT_ID, erEventtypeId: value } },
    update: { display: display || value, syncedAt: now() },
    create: { tenantId: TENANT_ID, erEventtypeId: value, value, display: display || value, syncedAt: now() },
  });
  eventTypeIdByValue.set(value, row.id);
  stats.eventTypes++;
  return row.id;
}

// ---- EVENTS (live, newest first) ----
async function ingestEvents() {
  let url = `/activity/events/?page_size=${PAGE_SIZE}&sort_by=-updated_at`;
  if (UPDATED_SINCE) url += `&updated_since=${encodeURIComponent(UPDATED_SINCE)}`;
  const cutoff = UPDATED_SINCE ? new Date(UPDATED_SINCE) : null;
  let page = 0;
  let reachedCutoff = false;
  while (url && page < EVENTS_PAGES && !reachedCutoff) {
    const env = await erGet(url);
    const results = env.results || [];
    if (!results.length) break;
    for (const ev of results) {
      // Stop once newest-first paging walks past the incremental cutoff.
      if (cutoff) {
        const u = new Date(ev.updated_at || ev.time);
        if (!isNaN(u) && u < cutoff) { reachedCutoff = true; break; }
      }
      const etId = await ensureEventType(ev.event_type, ev.title);
      const loc = ev.location || {};
      const data = {
        eventTypeId: etId,
        serialNumber: ev.serial_number != null ? String(ev.serial_number) : null,
        title: ev.title || ev.message || null,
        priority: Number(ev.priority) || 0,
        state: mapEventState(ev.state),
        locationLat: loc.latitude ?? null,
        locationLon: loc.longitude ?? null,
        reportedByName: ev.reported_by?.name || null,
        reportedAt: d(ev.time),
        endTime: d(ev.end_time),
        eventDetailsJson: ev.event_details || undefined,
        notesJson: ev.notes && ev.notes.length ? ev.notes : undefined,
        address: ev.address || null,
        hasPhoto: Array.isArray(ev.files) && ev.files.length > 0,
        syncedAt: now(),
      };
      await prisma.event.upsert({
        where: { tenantId_erEventId: { tenantId: TENANT_ID, erEventId: ev.id } },
        update: data,
        create: { tenantId: TENANT_ID, erEventId: ev.id, ...data },
      });
      track(ev.updated_at || ev.time);
      stats.events++;
    }
    page++;
    console.log(`[events] page ${page}: +${results.length} (total ${stats.events})`);
    url = env.next || null;
    await sleep(150);
  }
}

// ---- SUBJECTS (live) ----
const subjectIdByEr = new Map();
async function ingestSubjects() {
  let url = `/subjects/?page_size=${PAGE_SIZE}`;
  while (url) {
    const env = await erGet(url);
    const results = env.results || [];
    if (!results.length) break;
    for (const s of results) {
      const lp = s.last_position?.geometry?.coordinates;
      const data = {
        name: s.name || "Unknown",
        subjectType: s.subject_type || null,
        subjectSubtype: s.subject_subtype || null,
        lastPositionLon: lp ? lp[0] : null,
        lastPositionLat: lp ? lp[1] : null,
        lastPositionAt: d(s.last_position_date),
        isActive: s.is_active !== false,
        additionalJson: s.additional && Object.keys(s.additional).length ? s.additional : undefined,
        syncedAt: now(),
      };
      const row = await prisma.subject.upsert({
        where: { tenantId_erSubjectId: { tenantId: TENANT_ID, erSubjectId: s.id } },
        update: data,
        create: { tenantId: TENANT_ID, erSubjectId: s.id, ...data },
      });
      subjectIdByEr.set(s.id, row.id);
      track(s.updated_at);
      stats.subjects++;

      // lightweight observation from last_position (newest known fix)
      if (lp && s.last_position_date) {
        try {
          const obsErId = `${s.id}:${s.last_position_date}`;
          await prisma.observation.upsert({
            where: { tenantId_erObservationId: { tenantId: TENANT_ID, erObservationId: obsErId } },
            update: { locationLat: lp[1], locationLon: lp[0], recordedAt: new Date(s.last_position_date), sourceName: s.name, syncedAt: now() },
            create: { tenantId: TENANT_ID, erObservationId: obsErId, subjectId: row.id, locationLat: lp[1], locationLon: lp[0], recordedAt: new Date(s.last_position_date), sourceName: s.name, syncedAt: now() },
          });
          stats.observations++;
        } catch { /* ignore obs failures */ }
      }
    }
    console.log(`[subjects] +${results.length} (total ${stats.subjects})`);
    url = env.next || null;
    await sleep(150);
  }
}

// ---- PATROLS + SEGMENTS + TRACKS (from cache) ----
function loadCache() {
  const p = path.join(CACHE_DIR, "patrol-cache.json");
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const map = raw.patrols || {};
  return Object.values(map).map((w) => w.patrol).filter(Boolean);
}

// Live patrol pull from /activity/patrols, paginated newest-first, throttled.
// Reuses the same patrol object shape as the cache (id, state, serial_number,
// title, patrol_segments[].leader/time_range), so the upsert loop below is
// identical regardless of source.
async function loadPatrolsFromApi() {
  const out = [];
  let url = `/activity/patrols/?page_size=${PATROL_PAGE_SIZE}&ordering=-serial_number`;
  let page = 0;
  while (url) {
    const res = await erGet(url);
    const body = res?.data || res || {};
    const results = body.results || [];
    out.push(...results);
    page++;
    console.log(`[patrols:api] page ${page}: +${results.length} (total ${out.length}${body.count ? "/" + body.count : ""})`);
    url = body.next || null;
    if (url) await sleep(PATROL_PAGE_DELAY);
  }
  return out;
}

async function ingestPatrols() {
  let all = PATROL_SOURCE === "api" ? await loadPatrolsFromApi() : loadCache();
  // newest first by serial_number desc
  all.sort((a, b) => (Number(b.serial_number) || 0) - (Number(a.serial_number) || 0));
  if (PATROL_LIMIT !== Infinity) all = all.slice(0, PATROL_LIMIT);

  let i = 0;
  for (const p of all) {
    const segs = p.patrol_segments || [];
    const firstSeg = segs[0] || {};
    const tr = firstSeg.time_range || {};
    const startLoc = firstSeg.start_location || {};
    const endLoc = firstSeg.end_location || {};
    const ptype = mapPatrolType(firstSeg.patrol_type || p.patrol_type);
    const data = {
      serialNumber: p.serial_number != null ? String(p.serial_number) : null,
      title: p.title || null,
      patrolType: ptype,
      state: mapPatrolState(p.state),
      startTime: d(tr.start_time),
      endTime: d(tr.end_time),
      startLocationLat: startLoc.latitude ?? null,
      startLocationLon: startLoc.longitude ?? null,
      endLocationLat: endLoc.latitude ?? null,
      endLocationLon: endLoc.longitude ?? null,
      syncedAt: now(),
      lastSyncedAt: now(),
    };
    const patrolRow = await prisma.patrol.upsert({
      where: { tenantId_erPatrolId: { tenantId: TENANT_ID, erPatrolId: p.id } },
      update: data,
      create: { tenantId: TENANT_ID, erPatrolId: p.id, ...data },
    });
    track(tr.start_time);
    stats.patrols++;

    for (const seg of segs) {
      const str = seg.time_range || {};
      try {
        await prisma.patrolSegment.upsert({
          where: { patrolId_erSegmentId: { patrolId: patrolRow.id, erSegmentId: seg.id } },
          update: { actualStart: d(str.start_time), actualEnd: d(str.end_time), leaderName: seg.leader?.name || null, leaderErId: seg.leader?.id || null, syncedAt: now() },
          create: { patrolId: patrolRow.id, erSegmentId: seg.id, actualStart: d(str.start_time), actualEnd: d(str.end_time), leaderName: seg.leader?.name || null, leaderErId: seg.leader?.id || null, syncedAt: now() },
        });
        stats.segments++;
      } catch { /* skip */ }
    }

    // track file (one per patrol id)
    const trackFile = path.join(CACHE_DIR, "patrol-tracks", `${p.id}.json`);
    if (fs.existsSync(trackFile)) {
      try {
        const geojson = JSON.parse(fs.readFileSync(trackFile, "utf8"));
        const feat = geojson.features?.[0];
        const coords = feat?.geometry?.coordinates || [];
        const pointCount = Array.isArray(coords) ? coords.length : 0;
        if (pointCount > 0) {
          const since = d(tr.start_time) || patrolRow.startTime || now();
          const until = d(tr.end_time) || patrolRow.endTime || now();
          await prisma.patrolTrack.upsert({
            where: { patrolId: patrolRow.id },
            update: { trackGeojson: geojson, pointCount, since, until, patrolEnded: patrolRow.state === "done", source: "cache", fetchedAt: now() },
            create: { tenantId: TENANT_ID, patrolId: patrolRow.id, since, until, trackGeojson: geojson, hasTimestamps: false, pointCount, patrolEnded: patrolRow.state === "done", source: "cache", fetchedAt: now() },
          });
          stats.tracks++;
        }
      } catch { /* skip bad track file */ }
    }

    i++;
    if (i % 200 === 0) console.log(`[patrols] ${i}/${all.length} (segments ${stats.segments}, tracks ${stats.tracks})`);
  }
  console.log(`[patrols] done: ${stats.patrols} patrols, ${stats.segments} segments, ${stats.tracks} tracks`);
}

// ---- main ----
(async () => {
  console.log(`Ingest -> tenant ${TENANT_ID} | base ${ER_BASE}`);
  if (!ER_TOKEN && (DO_EVENTS || DO_SUBJECTS)) console.warn("WARN: no DAS_WEB_TOKEN; live calls will fail");

  await ingestEventTypes();

  if (DO_PATROLS) {
    console.log(`\n=== PATROLS (${PATROL_SOURCE}, newest serial first) ===`);
    await ingestPatrols();
    console.log(">>> CHECKPOINT", JSON.stringify(stats));
  }
  if (DO_EVENTS) {
    console.log("\n=== EVENTS (live, newest updated_at first) ===");
    await ingestEvents();
    console.log(">>> CHECKPOINT", JSON.stringify(stats));
  }
  if (DO_SUBJECTS) {
    console.log("\n=== SUBJECTS (live) ===");
    await ingestSubjects();
    console.log(">>> CHECKPOINT", JSON.stringify(stats));
  }

  console.log("\n===== FINAL =====");
  console.log(JSON.stringify(stats, null, 2));
  console.log("Date range ingested:", oldest?.toISOString(), "->", newest?.toISOString());
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("FATAL:", e.message);
  console.log("Partial stats:", JSON.stringify(stats));
  await prisma.$disconnect();
  process.exit(1);
});
