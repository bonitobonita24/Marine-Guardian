/**
 * municipalityCoverage tRPC router.
 *
 * Two procedures:
 *   municipalityCoverage — patrol + event counts grouped by municipality (30-day
 *     window by default; accepts an optional date range).
 *   protectedZoneCoverage — patrol + event counts for all ProtectedZone rows
 *     (30-day window by default; accepts an optional date range).
 *
 * Both procedures are time-based activity aggregations (patrol startTime /
 * event reportedAt / zone-coverage assignedAt), so both honour the War Room
 * date range (2026-06-25, T4b). The range input mirrors dashboard.ts's
 * { dateFrom, dateTo } shape and is fully backward-compatible: when omitted,
 * each procedure behaves exactly as it did before (existing callers + the
 * Coverage Report's own { since, until } usage are unaffected). For
 * municipalityCoverage, { dateFrom, dateTo } take precedence over the legacy
 * { since, until } fields when both are supplied.
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
          // War Room range (preferred — mirrors dashboard.ts).
          dateFrom: z.coerce.date().optional(),
          dateTo: z.coerce.date().optional(),
          // Legacy fields retained for backward compatibility.
          since: z.date().optional(),
          until: z.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // dateFrom/dateTo take precedence over the legacy since/until fields.
      const since =
        input?.dateFrom ??
        input?.since ??
        new Date(Date.now() - THIRTY_DAYS_MS);
      const until = input?.dateTo ?? input?.until ?? new Date();

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

  protectedZoneCoverage: tenantProcedure
    .input(
      z
        .object({
          dateFrom: z.coerce.date().optional(),
          dateTo: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Zone coverage counts patrol/event→zone assignments over time, so it is
      // a time-based aggregation and honours the War Room range. Default window
      // (range omitted) is unchanged: last 30 days, no upper bound.
      const since = input?.dateFrom ?? new Date(Date.now() - THIRTY_DAYS_MS);
      // assignedAt filter: always lower-bounded; upper-bounded only when dateTo
      // is supplied (preserves the original open-ended default behaviour).
      const assignedAtFilter =
        input?.dateTo != null
          ? { gte: since, lte: input.dateTo }
          : { gte: since };

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
            assignedAt: assignedAtFilter,
          },
          _count: { id: true },
        }),
        prisma.eventCoveredZone.groupBy({
          by: ["protectedZoneId"],
          where: {
            tenantId: ctx.tenantId,
            assignedAt: assignedAtFilter,
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
