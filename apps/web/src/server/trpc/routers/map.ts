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

      const observations = await prisma.observation.findMany({
        where: {
          tenantId: ctx.tenantId,
          subjectId: { in: leaderSubjects.map((s) => s.id) },
          recordedAt: { gte: start, lte: end },
        },
        orderBy: { recordedAt: "asc" },
        take: 5000,
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
