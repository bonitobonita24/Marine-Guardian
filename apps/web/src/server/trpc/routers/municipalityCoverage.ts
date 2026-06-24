/**
 * municipalityCoverage tRPC router.
 *
 * Two procedures:
 *   municipalityCoverage — patrol + event counts grouped by municipality (30-day
 *     window by default; accepts optional since/until date range).
 *   protectedZoneCoverage — patrol + event counts for all ProtectedZone rows.
 *
 * Both are tenant-scoped via tenantProcedure (ctx.tenantId).
 * Data is derived from municipality_id FK set by the municipality-assign BullMQ job.
 */

import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";
import { z } from "zod";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const municipalityCoverageRouter = router({
  municipalityCoverage: tenantProcedure
    .input(
      z
        .object({
          since: z.date().optional(),
          until: z.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const since = input?.since ?? new Date(Date.now() - THIRTY_DAYS_MS);
      const until = input?.until ?? new Date();

      const [municipalities, patrolCounts, eventCounts] = await Promise.all([
        prisma.municipality.findMany({
          where: { tenantId: ctx.tenantId },
          select: { id: true, name: true, province: true, slug: true },
          orderBy: { name: "asc" },
        }),
        prisma.patrol.groupBy({
          by: ["municipalityId"],
          where: {
            tenantId: ctx.tenantId,
            isDeleted: false,
            isTestPatrol: false,
            startTime: { gte: since, lte: until },
            municipalityId: { not: null },
          },
          _count: { id: true },
        }),
        prisma.event.groupBy({
          by: ["municipalityId"],
          where: {
            tenantId: ctx.tenantId,
            reportedAt: { gte: since, lte: until },
            municipalityId: { not: null },
          },
          _count: { id: true },
        }),
      ]);

      // municipalityId is guaranteed non-null by the `not: null` filter above,
      // but Prisma types it as `string | null` on groupBy results — use `?? ""`
      // to satisfy strict-boolean-expressions without a forbidden non-null assertion.
      const patrolMap = Object.fromEntries(
        patrolCounts.map((r) => [r.municipalityId ?? "", r._count.id]),
      );
      const eventMap = Object.fromEntries(
        eventCounts.map((r) => [r.municipalityId ?? "", r._count.id]),
      );

      return municipalities.map((m) => ({
        municipalityId: m.id,
        municipality: m.name,
        province: m.province,
        slug: m.slug,
        patrolCount: patrolMap[m.id] ?? 0,
        eventCount: eventMap[m.id] ?? 0,
      }));
    }),

  protectedZoneCoverage: tenantProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const [zones, patrolZoneCounts, eventZoneCounts] = await Promise.all([
      prisma.protectedZone.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          id: true,
          name: true,
          parentMunicipality: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.patrolCoveredZone.groupBy({
        by: ["protectedZoneId"],
        where: {
          tenantId: ctx.tenantId,
          assignedAt: { gte: since },
        },
        _count: { id: true },
      }),
      prisma.eventCoveredZone.groupBy({
        by: ["protectedZoneId"],
        where: {
          tenantId: ctx.tenantId,
          assignedAt: { gte: since },
        },
        _count: { id: true },
      }),
    ]);

    const pzPatrol = Object.fromEntries(
      patrolZoneCounts.map((r) => [r.protectedZoneId, r._count.id]),
    );
    const pzEvent = Object.fromEntries(
      eventZoneCounts.map((r) => [r.protectedZoneId, r._count.id]),
    );

    return zones.map((z) => ({
      zoneId: z.id,
      zone: z.name,
      parentMunicipality: z.parentMunicipality?.name ?? null,
      patrolCount: pzPatrol[z.id] ?? 0,
      eventCount: pzEvent[z.id] ?? 0,
    }));
  }),
});
