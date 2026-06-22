import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";

const STALE_THRESHOLD_MS = 60 * 60 * 1000;

const eventsListInput = z
  .object({
    since: z.date().optional(),
  })
  .strict();

const patrolTracksInput = z
  .object({
    patrolId: z.string().min(1),
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

const eventsRouter = router({
  list: tenantProcedure.input(eventsListInput).query(async ({ ctx, input }) => {
    const where: {
      tenantId: string;
      locationLat: { not: null };
      locationLon: { not: null };
      reportedAt?: { gte: Date };
    } = {
      tenantId: ctx.tenantId,
      locationLat: { not: null },
      locationLon: { not: null },
    };
    if (input.since) {
      where.reportedAt = { gte: input.since };
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

  // All-active-tracks overlay: materialize the tracks of every open (active)
  // patrol in one tenant-scoped request, tagged with patrolType so the client
  // can style each track by type (seaborne solid / foot dashed). Bounded by
  // ACTIVE_TRACKS_PATROL_CAP patrols and TRACK_OBSERVATION_CAP points each.
  active: tenantProcedure.query(async ({ ctx }) => {
    const patrols = await prisma.patrol.findMany({
      where: {
        tenantId: ctx.tenantId,
        state: "open",
        isDeleted: false,
        isTestPatrol: false,
      },
      take: ACTIVE_TRACKS_PATROL_CAP,
      orderBy: { startTime: "desc" },
      select: {
        id: true,
        title: true,
        patrolType: true,
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

    if (patrols.length === 0) return { tracks: [] };

    // Resolve the union of all leader ER ids across the active patrols so we
    // can map ER ids -> internal subject ids in a single query.
    const allLeaderErIds = Array.from(
      new Set(
        patrols.flatMap((p) =>
          p.segments
            .map((s) => s.leaderErId)
            .filter((id): id is string => id !== null),
        ),
      ),
    );

    const leaderSubjects =
      allLeaderErIds.length === 0
        ? []
        : await prisma.subject.findMany({
            where: {
              tenantId: ctx.tenantId,
              erSubjectId: { in: allLeaderErIds },
            },
            select: { id: true, erSubjectId: true },
          });

    const subjectIdByErId = new Map(
      leaderSubjects.map((s) => [s.erSubjectId, s.id]),
    );

    const tracks = await Promise.all(
      patrols.map(async (patrol) => {
        const subjectIds = patrol.segments
          .map((s) => s.leaderErId)
          .filter((id): id is string => id !== null)
          .map((erId) => subjectIdByErId.get(erId))
          .filter((id): id is string => id !== undefined);

        if (subjectIds.length === 0) {
          return {
            patrolId: patrol.id,
            title: patrol.title,
            patrolType: patrol.patrolType,
            points: [] as { lat: number; lon: number; recordedAt: Date }[],
          };
        }

        const { start, end } = resolvePatrolTrackWindow(patrol);

        const observations = await prisma.observation.findMany({
          where: {
            tenantId: ctx.tenantId,
            subjectId: { in: subjectIds },
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
          title: patrol.title,
          patrolType: patrol.patrolType,
          points: observations.map((o) => ({
            lat: o.locationLat,
            lon: o.locationLon,
            recordedAt: o.recordedAt,
          })),
        };
      }),
    );

    // Only return tracks that actually have a renderable polyline (>= 2 points).
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
