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

export const municipalityRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return prisma.municipality.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, province: true, slug: true },
      orderBy: { name: "asc" },
    });
  }),
});
