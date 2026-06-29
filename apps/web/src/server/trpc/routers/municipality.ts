/**
 * municipality tRPC router.
 *
 * A thin lookup router for the Interactive Report Map (2026-06-27): the report
 * surface needs a flat {id, name, province, slug} list to populate the
 * municipality filter Select. Activity aggregations (patrol/event counts) live
 * in municipalityCoverage.ts — this router is identity/labels only.
 *
 * Tenant-scoped via tenantProcedure (ctx.tenantId).
 */

import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma } from "@marine-guardian/db";
import { MUNICIPALITIES } from "@/data/coverage/coverage-areas";

// Canonical display order = owner's province-grouped list (coverage-areas.ts).
// Map each municipality slug → its registry index; anything not in the registry
// sorts last (alphabetically) as a safety net.
const ORDER_BY_SLUG = new Map(MUNICIPALITIES.map((m, i) => [m.id, i]));

export const municipalityRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await prisma.municipality.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, province: true, slug: true },
    });
    return rows.sort((a, b) => {
      const ia = ORDER_BY_SLUG.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
      const ib = ORDER_BY_SLUG.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name);
    });
  }),

  // Protected zones (MPAs) for the Report Map MPA-scope filter Select. A flat
  // {id, name, parentMunicipalityId} list — the filter narrows events/patrols
  // to a single zone via the EventCoveredZone / PatrolCoveredZone joins.
  protectedZones: tenantProcedure.query(async ({ ctx }) => {
    return prisma.protectedZone.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, slug: true, parentMunicipalityId: true },
      orderBy: { name: "asc" },
    });
  }),
});
