import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma, decrypt, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient, Prisma } from "@marine-guardian/db";
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
          // Allow empty strings so optional text fields are clearable from the
          // detail form (the UI sends "" for blank fields rather than omitting them).
          title: z.string().max(500).optional(),
          priority: z.number().int().min(0).max(3).optional(),
          notesJson: z.unknown().optional(),
          eventDetailsJson: z.unknown().optional(),
          offenderName: z.string().max(200).optional(),
          vesselName: z.string().max(200).optional(),
          vesselRegistration: z.string().max(100).optional(),
          address: z.string().max(500).optional(),
          actionTaken: z.string().max(5000).optional(),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.event.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          erEventId: true,
          title: true,
          priority: true,
          notesJson: true,
          eventDetailsJson: true,
          offenderName: true,
          vesselName: true,
          vesselRegistration: true,
          address: true,
          actionTaken: true,
        },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.notesJson !== undefined) data.notesJson = input.notesJson;
      if (input.eventDetailsJson !== undefined) data.eventDetailsJson = input.eventDetailsJson;
      if (input.offenderName !== undefined) data.offenderName = input.offenderName;
      if (input.vesselName !== undefined) data.vesselName = input.vesselName;
      if (input.vesselRegistration !== undefined) data.vesselRegistration = input.vesselRegistration;
      if (input.address !== undefined) data.address = input.address;
      if (input.actionTaken !== undefined) data.actionTaken = input.actionTaken;

      if (Object.keys(data).length === 0) {
        return existing;
      }

      const before: Record<string, Prisma.JsonValue> = {};
      const after: Record<string, Prisma.JsonValue> = {};
      const scalarKeys = [
        "title",
        "priority",
        "offenderName",
        "vesselName",
        "vesselRegistration",
        "address",
        "actionTaken",
      ] as const;
      for (const key of scalarKeys) {
        if (input[key] !== undefined && input[key] !== existing[key]) {
          before[key] = existing[key] ?? null;
          after[key] = input[key];
        }
      }
      if (input.notesJson !== undefined) {
        before.notesJson = existing.notesJson ?? null;
        after.notesJson = input.notesJson;
      }
      if (input.eventDetailsJson !== undefined) {
        before.eventDetailsJson = existing.eventDetailsJson ?? null;
        after.eventDetailsJson = input.eventDetailsJson;
      }

      const updated = await prisma.event.update({
        where: { id: input.id },
        data,
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

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "UPDATE_EVENT",
        entityType: "Event",
        entityId: input.id,
        changesJson: { before, after },
        ipAddress: ctx.ip,
        severity: "info",
      });

      if (
        input.title !== undefined ||
        input.priority !== undefined ||
        input.eventDetailsJson !== undefined
      ) {
        await pushUpdateToErIfConfigured(ctx.tenantId, existing.erEventId, {
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
