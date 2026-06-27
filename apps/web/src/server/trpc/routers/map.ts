import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

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

const eventsRouter = router({
  list: tenantProcedure.input(eventsListInput).query(async ({ ctx, input }) => {
    const where: {
      tenantId: string;
      locationLat: { not: null };
      locationLon: { not: null };
      NOT: { eventType: { display: { contains: string; mode: "insensitive" } } };
      reportedAt?: { gte?: Date; lte?: Date };
      municipalityId?: string;
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
        priority: true,
        state: true,
        locationLat: true,
        locationLon: true,
        reportedAt: true,
        eventType: { select: { display: true, category: true } },
      },
    });

    return rows;
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

export const mapRouter = router({
  events: eventsRouter,
  subjects: subjectsRouter,
  patrolTracks: patrolTracksRouter,
  patrolAreas: patrolAreasRouter,
});
