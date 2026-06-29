import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";
import { EVENT_CATEGORY } from "@/components/map/eventMarkerStyle";
import { boundaryKindFromRef, municipalityIdFromRef } from "./boundary-kind";
import {
  canonicalIndex,
  type EventTypeVariant,
} from "@/lib/event-type-order";

const STALE_THRESHOLD_MS = 60 * 60 * 1000;

const eventsListInput = z
  .object({
    since: z.date().optional(),
    // War Room range filter (2026-06-27): the Command Center passes the active
    // FROM/TO window so the map's event markers follow the same date range as
    // the dashboard breakdown / feed. The standalone Live Map omits both and
    // keeps showing the live (unfiltered) event set.
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    // Interactive Report Map (2026-06-27): optional municipality filter so the
    // report surface can narrow every panel (markers, charts) to one
    // municipality. Omitted by the Command Center embed + Live Map, which show
    // all municipalities.
    municipalityId: z.string().optional(),
    // Optional MPA-scope filter (2026-06-29): narrow markers to events that fall
    // inside a given protected zone (EventCoveredZone join). Independent of the
    // municipality filter — both may apply.
    protectedZoneId: z.string().optional(),
  })
  .strict();

const patrolTracksInput = z
  .object({
    patrolId: z.string().min(1),
  })
  .strict();

// Interactive Report Map (2026-06-27): date- + municipality-filtered patrol
// tracks for the report page, replacing the live-only `active` overlay there.
// Tracks are selected by their patrol's startTime falling inside the range and
// (optionally) the patrol's municipalityId.
const patrolTracksInRangeInput = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    municipalityId: z.string().optional(),
    protectedZoneId: z.string().optional(),
  })
  .strict();

const patrolAreasInput = z
  .object({
    activeOnly: z.boolean().default(true),
  })
  .strict();

// All-active-tracks overlay (Phase 7): cap the number of patrols whose tracks
// are materialized in a single request so the payload stays bounded even for
// tenants with many concurrently-open patrols.
const ACTIVE_TRACKS_PATROL_CAP = 50;
// Per-patrol observation cap mirrors the single-track byPatrolId limit.
const TRACK_OBSERVATION_CAP = 5000;

type PatrolTrackSegment = {
  leaderErId: string | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
};

type PatrolTrackInput = {
  startTime: Date | null;
  endTime: Date | null;
  segments: PatrolTrackSegment[];
};

/**
 * Resolve the [start, end] time window for a patrol's track, preferring the
 * patrol's own timestamps and falling back to the segment actual/scheduled
 * extents. Shared by byPatrolId and the all-active overlay so both render the
 * identical window. Exported for unit testing.
 */
export function resolvePatrolTrackWindow(patrol: PatrolTrackInput): {
  start: Date;
  end: Date;
} {
  const start =
    patrol.startTime ??
    patrol.segments
      .map((s) => s.actualStart ?? s.scheduledStart)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ??
    new Date(0);

  const end =
    patrol.endTime ??
    patrol.segments
      .map((s) => s.actualEnd ?? s.scheduledEnd)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ??
    new Date();

  return { start, end };
}

type TrackPoint = { lat: number; lon: number; recordedAt: Date | null };

/**
 * Extract polyline points from a stored PatrolTrack.trackGeojson.
 *
 * Tracks are ingested from EarthRanger as a GeoJSON FeatureCollection whose
 * first feature is a LineString of [lon, lat] coordinates (the dense GPS
 * polyline). This is the authoritative track geometry — the dashboard map
 * reads it directly rather than reconstructing a polyline from per-point
 * Observation rows (which are only populated by the live track-token sync that
 * is not always available). recordedAt is null because stored LineString
 * coordinates carry no per-vertex timestamp (hasTimestamps=false at ingest).
 */
export function pointsFromTrackGeojson(geojson: unknown): TrackPoint[] {
  const fc = geojson as
    | { features?: { geometry?: { type?: string; coordinates?: unknown } }[] }
    | null;
  const geom = fc?.features?.[0]?.geometry;
  if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) {
    return [];
  }
  const out: TrackPoint[] = [];
  for (const c of geom.coordinates as unknown[]) {
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      out.push({ lon: c[0], lat: c[1], recordedAt: null });
    }
  }
  return out;
}

// ── L3 sub-type taxonomy (2026-06-29) ──────────────────────────────────────
// The ER report form's "Type" select is flattened into ONE non-uniformly named
// key per event type inside `event_details_json` (there is no dedicated column).
// L3_TYPE_KEY maps each event-type display → that flattened detail key so the map
// controls can offer a 3rd-tier per-value toggle nested under each L2 type. A
// `null` value means the type carries no meaningful sub-Type dimension — every
// event buckets as "(Unspecified)". Verified against the live ER dataset
// (2026-06-29). Types NOT listed here fall through to the heuristic below.
const L3_TYPE_KEY: Record<string, string | null> = {
  // Law enforcement
  "Unregistered Illegal Fishing":
    "unregisteredillegalfishing_unregistered_fishinggear",
  "Fishing in a prohibited area (MPA)": "fishinginaprohibitedareampa_fishinggear",
  "Use of Prohibited Gears": "useofprohibitedgears_fishinggear",
  "Destructive Practices": "destructivepractices_type",
  "Taking of Prohibited Species": "takingofprohibitedspecies_species",
  // No usable Type field in the data — bucket every marker as (Unspecified).
  "Compressor Fishing": null,
  Others: null,
  // Monitoring — the analog classifier is the free-er "species" field.
  "Community Support": "species",
  "Infrastructure and assets": "species",
  "Marine wildlife sightings": "species",
  "Research and Studies": "species",
  "Threats on Habitat": "species",
};

// Cap on events scanned to enumerate L3 values for the toggle tree (per tenant,
// the two map categories). Generous — the demo dataset is ~2.3k such events.
const L3_EVENT_SCAN_CAP = 20000;

/** Structural / non-classifier keys never offered as an L3 dimension. */
function isStructuralL3Key(key: string): boolean {
  if (key === "updates" || key === "Boundary") return true;
  // The ER "Select ..." prompt keys are UI scaffolding, not real values.
  return key.toLowerCase().startsWith("select");
}

/**
 * Normalize a raw "Type" value into its toggle key + display label: trim and
 * collapse internal whitespace (the data is dirty — trailing spaces, double
 * spaces). Empty / non-string → the "(Unspecified)" bucket so events with no
 * Type value never vanish when L3 toggles are used. Exported for unit testing.
 */
export function normalizeL3(v: unknown): string {
  if (typeof v !== "string") return "(Unspecified)";
  const cleaned = v.trim().replace(/\s+/g, " ");
  return cleaned === "" ? "(Unspecified)" : cleaned;
}

/**
 * Heuristic fallback for an event type NOT in L3_TYPE_KEY: pick the
 * lowest-cardinality non-structural string key across the type's events — the
 * field that behaves most like a small enum classifier. Returns null when no
 * usable key exists.
 */
function heuristicL3Key(jsons: Record<string, unknown>[]): string | null {
  const valuesByKey = new Map<string, Set<string>>();
  for (const j of jsons) {
    for (const [key, val] of Object.entries(j)) {
      if (isStructuralL3Key(key) || typeof val !== "string") continue;
      const n = normalizeL3(val);
      if (n === "(Unspecified)") continue;
      let set = valuesByKey.get(key);
      if (set === undefined) {
        set = new Set<string>();
        valuesByKey.set(key, set);
      }
      set.add(n);
    }
  }
  let best: string | null = null;
  let bestCardinality = Number.POSITIVE_INFINITY;
  for (const [key, set] of valuesByKey) {
    if (set.size > 0 && set.size < bestCardinality) {
      bestCardinality = set.size;
      best = key;
    }
  }
  return best;
}

/**
 * Resolve the flattened detail key holding an event type's "Type" value:
 * curated map first, heuristic over the supplied event sample otherwise. Logs
 * (console.warn) a type that has data but no resolvable L3 key.
 */
function resolveL3Key(
  display: string,
  sampleJsons: Record<string, unknown>[],
): string | null {
  if (Object.prototype.hasOwnProperty.call(L3_TYPE_KEY, display)) {
    return L3_TYPE_KEY[display] ?? null;
  }
  const key = heuristicL3Key(sampleJsons);
  if (key === null && sampleJsons.some((j) => Object.keys(j).length > 0)) {
    console.warn(
      `[map.eventTypes] no resolvable L3 type key for event type "${display}"`,
    );
  }
  return key;
}

/** A stored event_details_json blob as a string-keyed record (or {} when null). */
function asJsonRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object"
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Distinct normalized L3 values (with counts) for a type, from its events'
 * detail blobs read at `key`. A null key → every event buckets as
 * "(Unspecified)". Sorted by count desc, then value asc. Exported for testing.
 */
export function l3ValuesFromJsons(
  jsons: Record<string, unknown>[],
  key: string | null,
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const j of jsons) {
    const raw = key !== null ? j[key] : undefined;
    const value = normalizeL3(raw);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const eventsRouter = router({
  list: tenantProcedure.input(eventsListInput).query(async ({ ctx, input }) => {
    const where: {
      tenantId: string;
      locationLat: { not: null };
      locationLon: { not: null };
      NOT: { eventType: { display: { contains: string; mode: "insensitive" } } };
      reportedAt?: { gte?: Date; lte?: Date };
      municipalityId?: string;
      coveredZones?: { some: { protectedZoneId: string } };
    } = {
      tenantId: ctx.tenantId,
      locationLat: { not: null },
      locationLon: { not: null },
      // Exclude Skylight automated vessel-detection events from the Live Map —
      // same display-based filter as the dashboard queries (Skylight events are
      // category="analyzer_event" with the marker only in eventType.display).
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    };
    if (input.municipalityId !== undefined) {
      where.municipalityId = input.municipalityId;
    }
    if (input.protectedZoneId !== undefined) {
      where.coveredZones = { some: { protectedZoneId: input.protectedZoneId } };
    }
    // `since` is the legacy lower-bound; `from`/`to` are the War Room window.
    const reportedAt: { gte?: Date; lte?: Date } = {};
    if (input.since) reportedAt.gte = input.since;
    if (input.from) reportedAt.gte = input.from;
    if (input.to) reportedAt.lte = input.to;
    if (reportedAt.gte !== undefined || reportedAt.lte !== undefined) {
      where.reportedAt = reportedAt;
    }

    const rows = await prisma.event.findMany({
      where,
      take: 200,
      orderBy: { reportedAt: "desc" },
      select: {
        id: true,
        title: true,
        serialNumber: true,
        priority: true,
        state: true,
        locationLat: true,
        locationLon: true,
        reportedAt: true,
        eventType: { select: { id: true, display: true, category: true } },
        // L3 sub-type source. The whole blob is read server-side to derive a
        // compact `eventTypeValue` per event (below) and is then STRIPPED from
        // the response — the client never receives the raw event_details_json.
        eventDetailsJson: true,
        // First few assets so the map marker can show a small image preview
        // (indicates the event has a photo). The client picks the first image
        // asset via isImageAsset(mimeType, filename).
        assets: {
          take: 4,
          select: { id: true, mimeType: true, filename: true },
        },
      },
    });

    // Resolve each event type's L3 detail key once (curated, else heuristic over
    // the loaded rows of that type) so every event of the same type reads its
    // "Type" value from the same key — keeping the marker filter consistent.
    const jsonsByDisplay = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const display = r.eventType?.display;
      if (display == null) continue;
      const list = jsonsByDisplay.get(display) ?? [];
      list.push(asJsonRecord(r.eventDetailsJson));
      jsonsByDisplay.set(display, list);
    }
    const keyByDisplay = new Map<string, string | null>();
    for (const [display, jsons] of jsonsByDisplay) {
      keyByDisplay.set(display, resolveL3Key(display, jsons));
    }

    // Add the compact `eventTypeValue` and drop the raw blob from the payload.
    return rows.map((r) => {
      const { eventDetailsJson, ...rest } = r;
      const display = r.eventType?.display ?? null;
      const key = display !== null ? keyByDisplay.get(display) ?? null : null;
      const raw = key !== null ? asJsonRecord(eventDetailsJson)[key] : undefined;
      return { ...rest, eventTypeValue: normalizeL3(raw) };
    });
  }),
});

const subjectsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await prisma.subject.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
      },
      take: 200,
      select: {
        id: true,
        name: true,
        subjectType: true,
        lastPositionLat: true,
        lastPositionLon: true,
        lastPositionAt: true,
      },
    });

    const now = Date.now();
    return rows.map((s) => ({
      ...s,
      isStale:
        s.lastPositionAt === null ||
        now - s.lastPositionAt.getTime() > STALE_THRESHOLD_MS,
    }));
  }),
});

const patrolTracksRouter = router({
  byPatrolId: tenantProcedure
    .input(patrolTracksInput)
    .query(async ({ ctx, input }) => {
      // Phase 7 soft-delete: map view must not render deleted patrol tracks.
      // findFirst (not findUnique) so the non-unique isDeleted filter applies.
      const patrol = await prisma.patrol.findFirst({
        where: { id: input.patrolId, isDeleted: false },
        select: {
          id: true,
          tenantId: true,
          startTime: true,
          endTime: true,
          segments: {
            select: {
              leaderErId: true,
              actualStart: true,
              actualEnd: true,
              scheduledStart: true,
              scheduledEnd: true,
            },
          },
        },
      });

      if (!patrol || patrol.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found." });
      }

      // Prefer the stored track polyline (PatrolTrack.trackGeojson) — that is
      // where the dense GPS geometry lives. Fall back to reconstructing from
      // Observation rows only when no stored track exists (e.g. a live patrol
      // whose track is still being streamed via subject observations).
      const storedTrack = await prisma.patrolTrack.findUnique({
        where: { patrolId: patrol.id },
        select: { trackGeojson: true },
      });
      if (storedTrack) {
        const points = pointsFromTrackGeojson(storedTrack.trackGeojson);
        if (points.length > 0) {
          return { patrolId: patrol.id, points };
        }
      }

      const leaderErIds = patrol.segments
        .map((s) => s.leaderErId)
        .filter((id): id is string => id !== null);

      if (leaderErIds.length === 0) {
        return { patrolId: patrol.id, points: [] };
      }

      const leaderSubjects = await prisma.subject.findMany({
        where: {
          tenantId: ctx.tenantId,
          erSubjectId: { in: leaderErIds },
        },
        select: { id: true },
      });

      if (leaderSubjects.length === 0) {
        return { patrolId: patrol.id, points: [] };
      }

      const { start, end } = resolvePatrolTrackWindow(patrol);

      const observations = await prisma.observation.findMany({
        where: {
          tenantId: ctx.tenantId,
          subjectId: { in: leaderSubjects.map((s) => s.id) },
          recordedAt: { gte: start, lte: end },
        },
        orderBy: { recordedAt: "asc" },
        take: TRACK_OBSERVATION_CAP,
        select: {
          locationLat: true,
          locationLon: true,
          recordedAt: true,
        },
      });

      return {
        patrolId: patrol.id,
        points: observations.map((o) => ({
          lat: o.locationLat,
          lon: o.locationLon,
          recordedAt: o.recordedAt,
        })),
      };
    }),

  // All-tracks overlay: materialize the polylines of the most RECENT patrols
  // (not only state="open") so the war-room map renders real track activity.
  // In the EarthRanger dataset the GPS tracks live almost entirely on COMPLETED
  // patrols (open patrols are header-only), so an open-only overlay is empty;
  // showing the most recent patrols-with-tracks is the owner-chosen behaviour
  // (2026-06-24). Reads stored PatrolTrack.trackGeojson directly, tagged with
  // patrolType so the client styles each track by type (seaborne solid / foot
  // dashed). Bounded by ACTIVE_TRACKS_PATROL_CAP, ordered by track recency.
  active: tenantProcedure.query(async ({ ctx }) => {
    const trackRows = await prisma.patrolTrack.findMany({
      where: {
        tenantId: ctx.tenantId,
        patrol: { isDeleted: false, isTestPatrol: false },
      },
      take: ACTIVE_TRACKS_PATROL_CAP,
      orderBy: { until: "desc" },
      select: {
        trackGeojson: true,
        patrol: { select: { id: true, title: true, patrolType: true } },
      },
    });

    const tracks = trackRows.map((row) => ({
      patrolId: row.patrol.id,
      title: row.patrol.title,
      patrolType: row.patrol.patrolType,
      points: pointsFromTrackGeojson(row.trackGeojson),
    }));

    // Only return tracks that actually have a renderable polyline (>= 2 points).
    return { tracks: tracks.filter((t) => t.points.length >= 2) };
  }),

  // Interactive Report Map (2026-06-27): date- + municipality-filtered tracks.
  // Same projection as `active` but the patrol set is bounded by startTime ∈
  // [from, to] and (optionally) municipalityId, so the report surface's tracks
  // follow the same FROM/TO/municipality filter as its markers and charts.
  inRange: tenantProcedure
    .input(patrolTracksInRangeInput)
    .query(async ({ ctx, input }) => {
      const patrolWhere: {
        isDeleted: false;
        isTestPatrol: false;
        startTime?: { gte?: Date; lte?: Date };
        municipalityId?: string;
        coveredZones?: { some: { protectedZoneId: string } };
      } = { isDeleted: false, isTestPatrol: false };

      const startTime: { gte?: Date; lte?: Date } = {};
      if (input.from) startTime.gte = input.from;
      if (input.to) startTime.lte = input.to;
      if (startTime.gte !== undefined || startTime.lte !== undefined) {
        patrolWhere.startTime = startTime;
      }
      if (input.municipalityId !== undefined) {
        patrolWhere.municipalityId = input.municipalityId;
      }
      if (input.protectedZoneId !== undefined) {
        patrolWhere.coveredZones = {
          some: { protectedZoneId: input.protectedZoneId },
        };
      }

      const trackRows = await prisma.patrolTrack.findMany({
        where: {
          tenantId: ctx.tenantId,
          patrol: patrolWhere,
        },
        take: ACTIVE_TRACKS_PATROL_CAP,
        orderBy: { until: "desc" },
        select: {
          trackGeojson: true,
          patrol: { select: { id: true, title: true, patrolType: true } },
        },
      });

      const tracks = trackRows.map((row) => ({
        patrolId: row.patrol.id,
        title: row.patrol.title,
        patrolType: row.patrol.patrolType,
        points: pointsFromTrackGeojson(row.trackGeojson),
      }));

      return { tracks: tracks.filter((t) => t.points.length >= 2) };
    }),
});

const patrolAreasRouter = router({
  list: tenantProcedure
    .input(patrolAreasInput)
    .query(async ({ ctx, input }) => {
      const where: { tenantId: string; isActive?: boolean } = {
        tenantId: ctx.tenantId,
      };
      if (input.activeOnly) {
        where.isActive = true;
      }

      const rows = await prisma.patrolArea.findMany({
        where,
        take: 200,
        select: {
          id: true,
          name: true,
          description: true,
          patrolType: true,
          polygonGeojson: true,
          colorHex: true,
        },
      });

      return rows;
    }),
});

// Hierarchical map-controls taxonomy (2026-06-29): the specific event types that
// exist under each filterable category, so the Interactive Report Map controls
// can offer a per-type toggle nested under each category master toggle. Returned
// in the canonical owner-defined display order (shared with the breakdown charts)
// so the toggle tree reads in the same fixed sequence everywhere; types with no
// canonical slot fall back to alphabetical after the listed ones.
type L3Value = { value: string; count: number };
type MapEventType = { id: string; display: string; types: L3Value[] };

function orderTypesCanonically(
  types: MapEventType[],
  variant: EventTypeVariant,
): MapEventType[] {
  return [...types].sort((a, b) => {
    const ia = canonicalIndex(a.display, variant);
    const ib = canonicalIndex(b.display, variant);
    const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (ra !== rb) return ra - rb;
    return a.display.localeCompare(b.display);
  });
}

const eventTypesRouter = router({
  // The law-enforcement + monitoring event types for the map filter tree. Derived
  // from the event_types table (the stable taxonomy) — not the in-range events —
  // so the toggle tree is fully populated regardless of the active date window.
  byCategory: tenantProcedure.query(async ({ ctx }) => {
    const rows = await prisma.eventType.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        category: {
          in: [EVENT_CATEGORY.lawEnforcement, EVENT_CATEGORY.monitoring],
        },
      },
      select: { id: true, display: true, category: true },
    });

    // L3 values are derived from the ACTUAL events (same tenant + category scope
    // this query already uses — no date filter, so the toggle tree is fully
    // populated regardless of the active window, matching the L2 behaviour).
    // event_details_json is aggregated server-side; only {value,count} per type
    // is returned to the client.
    const eventRows = await prisma.event.findMany({
      where: {
        tenantId: ctx.tenantId,
        eventType: {
          category: {
            in: [EVENT_CATEGORY.lawEnforcement, EVENT_CATEGORY.monitoring],
          },
        },
      },
      take: L3_EVENT_SCAN_CAP,
      select: { eventTypeId: true, eventDetailsJson: true },
    });

    const jsonsByTypeId = new Map<string, Record<string, unknown>[]>();
    for (const e of eventRows) {
      if (e.eventTypeId == null) continue;
      const list = jsonsByTypeId.get(e.eventTypeId) ?? [];
      list.push(asJsonRecord(e.eventDetailsJson));
      jsonsByTypeId.set(e.eventTypeId, list);
    }

    const law: MapEventType[] = [];
    const monitoring: MapEventType[] = [];
    for (const r of rows) {
      const jsons = jsonsByTypeId.get(r.id) ?? [];
      const key = resolveL3Key(r.display, jsons);
      const entry: MapEventType = {
        id: r.id,
        display: r.display,
        types: l3ValuesFromJsons(jsons, key),
      };
      if (r.category === EVENT_CATEGORY.lawEnforcement) law.push(entry);
      else if (r.category === EVENT_CATEGORY.monitoring) monitoring.push(entry);
    }

    return {
      lawEnforcement: orderTypesCanonically(law, "law_enforcement"),
      monitoring: orderTypesCanonically(monitoring, "monitoring"),
    };
  }),
});

// Official coverage boundaries (source=official) for the thin-line boundary
// overlay on both maps. Distinct from patrolAreas (the PatrolArea table) — these
// are the imported Municipality land/water + MPA outlines. `kind` is derived
// from the arcgisReferenceId provenance key (boundary-kind.ts) so the client can
// style land vs water vs protected-zone distinctly without a schema column.
const officialBoundariesRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const [rows, municipalities] = await Promise.all([
      prisma.areaBoundary.findMany({
        where: { tenantId: ctx.tenantId, source: "official", isEnabled: true },
        take: 200,
        select: {
          id: true,
          name: true,
          region: true,
          arcgisReferenceId: true,
          geometryGeojson: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.municipality.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, slug: true },
      }),
    ]);
    // Map each official boundary back to its source municipality (when it is a
    // municipality land/water boundary) so the map can fitBounds to the
    // selected municipality's full extent. MPA boundaries have no municipality.
    const slugToId = new Map(municipalities.map((m) => [m.slug, m.id]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      kind: boundaryKindFromRef(r.arcgisReferenceId),
      municipalityId:
        municipalityIdFromRef(r.arcgisReferenceId, slugToId) ?? null,
      geometryGeojson: r.geometryGeojson,
    }));
  }),
});

export const mapRouter = router({
  events: eventsRouter,
  eventTypes: eventTypesRouter,
  subjects: subjectsRouter,
  patrolTracks: patrolTracksRouter,
  patrolAreas: patrolAreasRouter,
  officialBoundaries: officialBoundariesRouter,
});
