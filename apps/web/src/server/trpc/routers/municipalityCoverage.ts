/**
 * municipalityCoverage tRPC router.
 *
 * Two procedures:
 *   municipalityCoverage — patrol + event counts grouped by municipality (30-day
 *     window by default; accepts an optional date range).
 *   protectedZoneCoverage — patrol + event counts for all ProtectedZone rows
 *     (30-day window by default; accepts an optional date range).
 *
 * Both procedures are time-based activity aggregations windowed by OCCURRENCE
 * time (patrol startTime / event reportedAt — for zone coverage too, via the
 * patrol/event relation, NOT the join row's assignedAt), so both honour the War
 * Room date range (2026-06-25, T4b). The range input mirrors dashboard.ts's
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
          // Optional municipality scope (Report Map filter). When supplied, the
          // chart is restricted to that single municipality; when omitted it
          // shows every municipality (province-wide) as before.
          municipalityId: z.string().optional(),
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

      // When a municipality is selected, scope both group-bys to that id;
      // otherwise count every assigned municipality (municipalityId not null).
      const municipalityFilter: string | { not: null } =
        input?.municipalityId != null ? input.municipalityId : { not: null };

      const [municipalities, patrolCounts, eventCounts] = await Promise.all([
        prisma.municipality.findMany({
          where: {
            tenantId: ctx.tenantId,
            ...(input?.municipalityId != null
              ? { id: input.municipalityId }
              : {}),
          },
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
            municipalityId: municipalityFilter,
          },
          _count: { id: true },
        }),
        prisma.event.groupBy({
          by: ["municipalityId"],
          where: {
            tenantId: ctx.tenantId,
            reportedAt: { gte: since, lte: until },
            municipalityId: municipalityFilter,
            // Exclude Skylight automated vessel-detection events so the coverage
            // chart's event counts match the Skylight-excluded KPI tiles and
            // breakdown bars (same display-based filter as dashboard.ts /
            // reportMap.ts — Skylight events carry an eventType.display of
            // "Skylight …").
            NOT: {
              eventType: {
                display: { contains: "skylight", mode: "insensitive" },
              },
            },
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
      // Zone coverage counts the patrols/events that OCCURRED inside the window
      // and fall within each zone. It MUST window by occurrence time
      // (patrol.startTime / event.reportedAt) — NOT by the join row's
      // assignedAt. assignedAt is the attribution-compute time, and the
      // zone-attribution re-derive job stamps it in BULK (every historical row
      // gets today's assignedAt on a re-run), so filtering on it floods every
      // recent window with the entire history (Q1 bug 2026-07-07: Apo Reef read
      // "182 patrols / 32 events" for a 48h window when the true 48h activity
      // was ~5 patrols / 0 events). Default window (range omitted) is unchanged:
      // last 30 days, no upper bound.
      //
      // Semantics now mirror the sibling municipalityCoverage procedure:
      // deleted/test patrols and Skylight automated-detection events are
      // excluded so the zone counts match the KPI tiles + coverage chart.
      const since = input?.dateFrom ?? new Date(Date.now() - THIRTY_DAYS_MS);
      // Occurrence-time filter: always lower-bounded; upper-bounded only when
      // dateTo is supplied (preserves the original open-ended default).
      const occurredAtFilter =
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
            patrol: {
              startTime: occurredAtFilter,
              isDeleted: false,
              isTestPatrol: false,
            },
          },
          _count: { id: true },
        }),
        prisma.eventCoveredZone.groupBy({
          by: ["protectedZoneId"],
          where: {
            tenantId: ctx.tenantId,
            event: {
              reportedAt: occurredAtFilter,
              // Same Skylight exclusion as municipalityCoverage / dashboard.
              NOT: {
                eventType: {
                  display: { contains: "skylight", mode: "insensitive" },
                },
              },
            },
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
