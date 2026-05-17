import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma, decrypt } from "@marine-guardian/db";
import { pushEventUpdateToEarthRanger } from "../../lib/earthranger-push";

type PushFieldsInput = {
  title?: string;
  priority?: number;
  eventDetailsJson?: unknown;
};

async function pushUpdateToErIfConfigured(
  tenantId: string,
  erEventId: string,
  input: PushFieldsInput,
): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { earthrangerUrl: true, earthrangerDasToken: true },
    });
    if (
      tenant === null ||
      tenant.earthrangerUrl === null ||
      tenant.earthrangerDasToken === null
    ) {
      return;
    }
    const baseUrl = decrypt(tenant.earthrangerUrl);
    const token = decrypt(tenant.earthrangerDasToken);

    const result = await pushEventUpdateToEarthRanger({
      baseUrl,
      token,
      erEventId,
      fields: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.eventDetailsJson !== undefined &&
        typeof input.eventDetailsJson === "object" &&
        input.eventDetailsJson !== null
          ? { eventDetails: input.eventDetailsJson as Record<string, unknown> }
          : {}),
      },
    });

    if (!result.ok) {
      console.error(
        `[event.update] ER push failed for ${erEventId}: ${result.error}`,
      );
    }
  } catch (err) {
    console.error(
      `[event.update] ER push threw unexpectedly for ${erEventId}:`,
      err,
    );
  }
}

/**
 * Filter inputs shared between the list query and the /api/exports/events
 * Route Handler. Exported so the export endpoint validates with the same
 * Zod schema (single source of truth).
 */
export const eventListFilters = z.object({
  state: z.enum(["new_event", "active", "resolved"]).optional(),
  priority: z.number().int().min(0).max(3).optional(),
});

export const eventRouter = router({
  list: tenantProcedure
    .input(
      eventListFilters.extend({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: { eventType: { select: { display: true, category: true } } },
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
      return prisma.event.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          eventType: true,
          notifications: { take: 10, orderBy: { createdAt: "desc" } },
          accompanyingRangers: {
            include: { registeredUser: { select: { id: true, fullName: true } }, knownRanger: true },
          },
        },
      });
    }),

  updateState: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        state: z.enum(["new_event", "active", "resolved"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.event.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { state: input.state },
      });
    }),

  update: tenantProcedure
    .input(
      z
        .object({
          id: z.string(),
          title: z.string().min(1).max(500).optional(),
          priority: z.number().int().min(0).max(3).optional(),
          notesJson: z.unknown().optional(),
          eventDetailsJson: z.unknown().optional(),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.notesJson !== undefined) data.notesJson = input.notesJson;
      if (input.eventDetailsJson !== undefined) data.eventDetailsJson = input.eventDetailsJson;

      const result = await prisma.event.updateMany({
        where: { id: input.id, tenantId: ctx.tenantId },
        data,
      });

      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const updated = await prisma.event.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          eventType: true,
          accompanyingRangers: {
            include: {
              registeredUser: { select: { id: true, fullName: true } },
              knownRanger: true,
            },
          },
        },
      });

      if (updated !== null) {
        await pushUpdateToErIfConfigured(ctx.tenantId, updated.erEventId, {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.eventDetailsJson !== undefined
            ? { eventDetailsJson: input.eventDetailsJson }
            : {}),
        });
      }

      return updated;
    }),

  addAccompanyingRanger: tenantProcedure
    .input(
      z
        .object({
          eventId: z.string(),
          registeredUserId: z.string().optional(),
          freetextName: z.string().min(1).max(200).optional(),
        })
        .strict()
        .refine(
          (data) =>
            (data.registeredUserId !== undefined && data.freetextName === undefined) ||
            (data.registeredUserId === undefined && data.freetextName !== undefined),
          { message: "Provide exactly one of registeredUserId or freetextName." }
        )
    )
    .mutation(async ({ ctx, input }) => {
      const event = await prisma.event.findFirst({
        where: { id: input.eventId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const isRegistered = input.registeredUserId !== undefined;

      return prisma.accompanyingRanger.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "event",
          entityId: input.eventId,
          rangerType: isRegistered ? "registered" : "freetext",
          addedByUserId: ctx.userId,
          ...(input.registeredUserId !== undefined
            ? { registeredUserId: input.registeredUserId }
            : {}),
          ...(input.freetextName !== undefined ? { freetextName: input.freetextName } : {}),
        },
        include: {
          registeredUser: { select: { id: true, fullName: true } },
        },
      });
    }),

  removeAccompanyingRanger: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ranger = await prisma.accompanyingRanger.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!ranger) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Accompanying ranger not found." });
      }

      await prisma.accompanyingRanger.delete({ where: { id: input.id } });

      return { success: true as const, removedId: input.id };
    }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    const [total, newEvents, active, resolved] = await Promise.all([
      prisma.event.count({ where: { tenantId: ctx.tenantId } }),
      prisma.event.count({ where: { tenantId: ctx.tenantId, state: "new_event" } }),
      prisma.event.count({ where: { tenantId: ctx.tenantId, state: "active" } }),
      prisma.event.count({ where: { tenantId: ctx.tenantId, state: "resolved" } }),
    ]);
    return { total, newEvents, active, resolved };
  }),
});
