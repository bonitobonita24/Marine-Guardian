import {
  listPatrolTracksInputSchema,
  getPatrolTrackByIdInputSchema,
  getPatrolTrackByPatrolIdInputSchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { matrixProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

/**
 * PatrolTrack router — READ-ONLY.
 *
 * PatrolTrack rows are NOT created/updated/deleted via tRPC. They are
 * materialized by the Patrol Track Materialization sync job (see
 * apps/web/src/server/sync/patrol-track-materialization.ts). Atomic upsert
 * keyed on patrolId. Per v2 PRODUCT.md §501-502.
 */
export const patrolTrackRouter = router({
  list: matrixProcedure(tenantProcedure, "patrols", "view")
    .input(listPatrolTracksInputSchema)
    .query(async ({ ctx, input }) => {
      const items = await prisma.patrolTrack.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.patrolId !== undefined ? { patrolId: input.patrolId } : {}),
          ...(input.patrolEnded !== undefined
            ? { patrolEnded: input.patrolEnded }
            : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { fetchedAt: "desc" },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  getById: matrixProcedure(tenantProcedure, "patrols", "view")
    .input(getPatrolTrackByIdInputSchema)
    .query(async ({ ctx, input }) => {
      return prisma.patrolTrack.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
    }),

  getByPatrolId: matrixProcedure(tenantProcedure, "patrols", "view")
    .input(getPatrolTrackByPatrolIdInputSchema)
    .query(async ({ ctx, input }) => {
      return prisma.patrolTrack.findFirst({
        where: { patrolId: input.patrolId, tenantId: ctx.tenantId },
      });
    }),
});
