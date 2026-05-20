import { z } from "zod";
import {
  createAreaBoundarySchema,
  updateAreaBoundarySchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import { enqueueAreaRederive } from "@marine-guardian/jobs";

// 5.1d — AreaBoundary CUD fan-out helper. When a boundary is created,
// updated, or deleted, the geometry universe for the tenant changes —
// every previously-derived areaBoundaryId on Event + Patrol + FuelEntry
// rows in that tenant is now potentially stale. Fan out enqueueAreaRederive
// for every row in the tenant. The BullMQ queue's 50/sec rate limiter
// (set in 5.1c worker) absorbs the load. Explicit `where: { tenantId }`
// is defense-in-depth — L6 auto-injects but the reports/exports rule in
// security.md requires explicit tenant scoping on every fan-out query.
// userId is the triggering admin (passed through from ctx.userId) — required
// by BaseJobPayload + validateTenantContext, surfaced in AuditLog at 5.1e.
async function fanOutAreaRederive(
  tenantId: string,
  userId: string,
): Promise<{ enqueued: number }> {
  const [events, patrols, fuelEntries] = await Promise.all([
    prisma.event.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.patrol.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.fuelEntry.findMany({ where: { tenantId }, select: { id: true } }),
  ]);
  await Promise.all([
    ...events.map((e) =>
      enqueueAreaRederive({ entity: "event", id: e.id, tenantId, userId }),
    ),
    ...patrols.map((p) =>
      enqueueAreaRederive({ entity: "patrol", id: p.id, tenantId, userId }),
    ),
    ...fuelEntries.map((f) =>
      enqueueAreaRederive({
        entity: "fuelEntry",
        id: f.id,
        tenantId,
        userId,
      }),
    ),
  ]);
  return { enqueued: events.length + patrols.length + fuelEntries.length };
}

export const areaBoundaryRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        isEnabled: z.boolean().optional(),
        region: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.areaBoundary.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { name: "asc" },
        include: { creator: { select: { id: true, fullName: true } } },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  getById: tenantProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.areaBoundary.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: { creator: { select: { id: true, fullName: true } } },
      });
    }),

  create: adminProcedure
    .input(createAreaBoundarySchema)
    .mutation(async ({ ctx, input }) => {
      const boundary = await prisma.areaBoundary.create({
        data: {
          name: input.name,
          aliases: input.aliases,
          region: input.region,
          source: input.source,
          geometryType: input.geometryType,
          geometryGeojson: input.geometryGeojson,
          isEnabled: input.isEnabled,
          overrideOfficial: input.overrideOfficial,
          ...(input.arcgisReferenceId !== null
            ? { arcgisReferenceId: input.arcgisReferenceId }
            : {}),
          tenantId: ctx.tenantId,
          createdByUserId: ctx.userId,
        },
      });
      const fanOut = await fanOutAreaRederive(ctx.tenantId, ctx.userId);
      return { boundary, fanOut };
    }),

  update: adminProcedure
    .input(
      z.object({ id: z.string() }).merge(updateAreaBoundarySchema)
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      const result = await prisma.areaBoundary.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
      const fanOut =
        result.count > 0
          ? await fanOutAreaRederive(ctx.tenantId, ctx.userId)
          : { enqueued: 0 };
      return { result, fanOut };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await prisma.areaBoundary.deleteMany({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
      const fanOut =
        result.count > 0
          ? await fanOutAreaRederive(ctx.tenantId, ctx.userId)
          : { enqueued: 0 };
      return { result, fanOut };
    }),
});
