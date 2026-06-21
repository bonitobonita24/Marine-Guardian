import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { prisma, decrypt, writeAuditLog } from "@marine-guardian/db";
import { Prisma } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import { pushEventUpdateToEarthRanger } from "../../lib/earthranger-push";

/**
 * The set of event fields that are locally editable.
 * Any field in this set that has an EventRevision row is considered
 * "locally edited" — the er-sync processor will skip overwriting it.
 */
export const EVENT_EDITABLE_FIELDS = [
  "title",
  "priority",
  "notesJson",
  "eventDetailsJson",
  "offenderName",
  "vesselName",
  "vesselRegistration",
  "address",
  "actionTaken",
] as const;

export type EventEditableField = (typeof EVENT_EDITABLE_FIELDS)[number];

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
 *
 * M3 additions (q-ops-01 Operations List):
 *   category  — event type category ("Law Enforcement" | "Monitoring, Patrolling & Surveillance")
 *   areaName  — municipality / area (string exact match, case-insensitive)
 *   dateFrom  — ISO date string; filters reportedAt >= dateFrom (monthly-accomplishment gate)
 *   dateTo    — ISO date string; filters reportedAt <= dateTo
 */
export const eventListFilters = z.object({
  state: z.enum(["new_event", "active", "resolved"]).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  // M3 — new server-side filters for Operations List
  category: z.string().max(200).optional(),
  areaName: z.string().max(200).optional(),
  dateFrom: z.string().optional(), // ISO date, inclusive lower bound on reportedAt
  dateTo: z.string().optional(),   // ISO date, inclusive upper bound on reportedAt
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
      const dateFromParsed = input.dateFrom !== undefined ? new Date(input.dateFrom) : undefined;
      const dateToParsed   = input.dateTo   !== undefined ? new Date(input.dateTo)   : undefined;
      const items = await prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.state    !== undefined ? { state:    input.state    } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          // category filter — via joined eventType.category
          ...(input.category !== undefined
            ? { eventType: { category: { equals: input.category, mode: "insensitive" } } }
            : {}),
          // areaName filter — case-insensitive substring match for flexibility
          ...(input.areaName !== undefined
            ? { areaName: { contains: input.areaName, mode: "insensitive" } }
            : {}),
          // date range on reportedAt (monthly-accomplishment view)
          ...(dateFromParsed !== undefined || dateToParsed !== undefined
            ? {
                reportedAt: {
                  ...(dateFromParsed !== undefined ? { gte: dateFromParsed } : {}),
                  ...(dateToParsed   !== undefined ? { lte: dateToParsed   } : {}),
                },
              }
            : {}),
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

      // Build revision rows for each changed field (q-ops-04 append-only).
      // We collect them here before the update so the before values are fresh.
      const revisionRows: {
        tenantId: string;
        eventId: string;
        userId: string;
        fieldName: string;
        beforeJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
        afterJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      }[] = [];
      for (const key of Object.keys(before)) {
        revisionRows.push({
          tenantId: ctx.tenantId,
          eventId: input.id,
          userId: ctx.userId,
          fieldName: key,
          beforeJson: before[key] === null ? Prisma.JsonNull : (before[key] as Prisma.InputJsonValue),
          afterJson: after[key] === null ? Prisma.JsonNull : (after[key] as Prisma.InputJsonValue),
        });
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

      // Write append-only revision rows (q-ops-04). Each changed field gets its own row.
      if (revisionRows.length > 0) {
        await prisma.eventRevision.createMany({ data: revisionRows });
      }

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

  /**
   * Autocomplete suggestions for the accompanying-ranger picker.
   *
   * Merges three tenant-scoped sources:
   *   1. KnownRanger registry (source = earthranger_sync | manual_entry)
   *   2. Recently-used ad-hoc freetext names on prior events (last 90 days)
   *   3. EarthRanger-sourced subjects with subject_type "person" / "ranger"
   *      (these are already in the KnownRanger table via earthranger_sync, but
   *      the Subject table is checked separately to catch any not yet promoted)
   *
   * Results are deduped: same normalised name + any matching known_id wins
   * the "known" side over ad-hoc. Max 20 suggestions.
   */
  suggestAccompanyingRangers: tenantProcedure
    .input(
      z.object({
        query: z.string().max(200).default(""),
      })
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      const tenantId = ctx.tenantId;

      // Source 1 — KnownRanger registry
      const knownRangers = await prisma.knownRanger.findMany({
        where: {
          tenantId,
          isActive: true,
          ...(q !== ""
            ? { name: { contains: q, mode: "insensitive" } }
            : {}),
        },
        orderBy: { name: "asc" },
        take: 20,
        select: { id: true, name: true, source: true, erSubjectId: true },
      });

      // Source 2 — recent ad-hoc freetext names (last 90 days, event entity only)
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const recentFreetext = await prisma.accompanyingRanger.findMany({
        where: {
          tenantId,
          entityType: "event",
          rangerType: "freetext",
          freetextName: q !== "" ? { contains: q, mode: "insensitive" } : { not: null },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { freetextName: true, knownRangerId: true },
      });

      // Source 3 — EarthRanger subjects with person/ranger subject_type not yet
      //            in knownRangers (they may be un-synced or type-filtered out)
      const erSubjects = await prisma.subject.findMany({
        where: {
          tenantId,
          isActive: true,
          subjectType: { in: ["person", "ranger"] },
          ...(q !== ""
            ? { name: { contains: q, mode: "insensitive" } }
            : {}),
        },
        orderBy: { name: "asc" },
        take: 20,
        select: { id: true, name: true, erSubjectId: true },
      });

      // ── Dedupe ────────────────────────────────────────────────────────────
      // Normalise: lowercase + collapse whitespace
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

      interface Suggestion {
        id: string | null;         // knownRangerId when available, else null
        name: string;
        source: "known_ranger" | "recent_freetext" | "er_subject";
        erSubjectId: string | null;
      }

      // Map: normalisedName → best suggestion (known beats ad-hoc)
      const seen = new Map<string, Suggestion>();

      for (const kr of knownRangers) {
        const key = norm(kr.name);
        seen.set(key, {
          id: kr.id,
          name: kr.name,
          source: "known_ranger",
          erSubjectId: kr.erSubjectId,
        });
      }

      // ER subjects — only add if not already covered by a knownRanger by
      // erSubjectId match OR by normalised name
      const knownErSubjectIds = new Set(knownRangers.map((k) => k.erSubjectId).filter(Boolean));
      for (const subj of erSubjects) {
        if (knownErSubjectIds.has(subj.erSubjectId)) continue; // already in source 1
        const key = norm(subj.name);
        if (!seen.has(key)) {
          seen.set(key, {
            id: null,
            name: subj.name,
            source: "er_subject",
            erSubjectId: subj.erSubjectId,
          });
        }
      }

      // Recent freetext — add only if not covered by name match in sources 1 or 3
      const seenFreetext = new Set<string>();
      for (const ar of recentFreetext) {
        const name = ar.freetextName;
        if (name === null || name === "") continue;
        const key = norm(name);
        if (seen.has(key)) continue; // already covered by known / ER subject
        if (seenFreetext.has(key)) continue; // dedupe within source 2
        seenFreetext.add(key);
        seen.set(key, {
          id: ar.knownRangerId ?? null,
          name,
          source: "recent_freetext",
          erSubjectId: null,
        });
      }

      const suggestions = [...seen.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 20);

      return { suggestions };
    }),

  addAccompanyingRanger: tenantProcedure
    .input(
      z
        .object({
          eventId: z.string(),
          registeredUserId: z.string().optional(),
          freetextName: z.string().min(1).max(200).optional(),
          // Optional: when the user selects from the KnownRanger registry
          // (source 1 of autocomplete), pass this to link the record directly.
          // Keeps the ad-hoc freetext path working when omitted.
          knownRangerId: z.string().optional(),
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

      // Validate knownRangerId belongs to this tenant when provided
      if (input.knownRangerId !== undefined) {
        const kr = await prisma.knownRanger.findFirst({
          where: { id: input.knownRangerId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!kr) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "KnownRanger not found.",
          });
        }
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
          ...(input.knownRangerId !== undefined ? { knownRangerId: input.knownRangerId } : {}),
        },
        include: {
          registeredUser: { select: { id: true, fullName: true } },
          knownRanger: { select: { id: true, name: true, source: true } },
        },
      });
    }),

  /**
   * Promote an ad-hoc freetext accompanying ranger into the KnownRanger
   * registry (source = manual_entry). Idempotent: if a KnownRanger with the
   * same normalised name already exists for this tenant, returns the existing
   * record rather than creating a duplicate.
   *
   * After promotion the caller should update the AccompanyingRanger row via
   * addAccompanyingRanger (or a future updateAccompanyingRanger) to link the
   * knownRangerId — the promotion itself does NOT mutate existing AR rows so
   * that historical audit lineage is preserved.
   */
  promoteToKnownRanger: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      const normalisedName = input.name.trim();

      // Idempotency: return existing record if name matches (case-insensitive)
      const existing = await prisma.knownRanger.findFirst({
        where: {
          tenantId,
          name: { equals: normalisedName, mode: "insensitive" },
        },
      });
      if (existing) {
        return { knownRanger: existing, created: false };
      }

      const knownRanger = await prisma.knownRanger.create({
        data: {
          tenantId,
          name: normalisedName,
          source: "manual_entry",
        },
      });

      return { knownRanger, created: true };
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

  /**
   * Fetch the edit-history revision timeline for a single event (q-ops-04).
   *
   * Returns revisions NEWEST-FIRST plus the immutable erOriginalSnapshot as
   * the synthetic "first" baseline entry (oldest position in the timeline).
   *
   * Security: tenant-scoped (L6) — only returns rows for this tenant's event.
   */
  getRevisions: tenantProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify tenant ownership of the event (L6 guard)
      const event = await prisma.event.findFirst({
        where: { id: input.eventId, tenantId: ctx.tenantId },
        select: { id: true, erOriginalSnapshot: true, syncedAt: true },
      });
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const revisions = await prisma.eventRevision.findMany({
        where: { tenantId: ctx.tenantId, eventId: input.eventId },
        orderBy: { createdAt: "desc" },
        include: {
          // We resolve the userId → displayName via a joined User query
        },
      });

      // Resolve editor display names for the revision list
      const userIds = [...new Set(revisions.map((r) => r.userId))];
      const users =
        userIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, fullName: true, email: true },
            })
          : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      const revisionList = revisions.map((r) => ({
        id: r.id,
        fieldName: r.fieldName,
        beforeJson: r.beforeJson,
        afterJson: r.afterJson,
        createdAt: r.createdAt,
        editor: userMap.get(r.userId) ?? { id: r.userId, fullName: null, email: null },
      }));

      return {
        revisions: revisionList,
        erOriginalSnapshot: event.erOriginalSnapshot,
        erSyncedAt: event.syncedAt,
      };
    }),

  /**
   * Returns the set of field names that have been locally edited for an event.
   * Used by the er-sync processor to skip overwriting locally-edited fields (q-ops conflict rule).
   * Exported as a standalone query so callers outside the router can use the same logic.
   */
  getEditedFields: tenantProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await prisma.eventRevision.findMany({
        where: { tenantId: ctx.tenantId, eventId: input.eventId },
        select: { fieldName: true },
        distinct: ["fieldName"],
      });
      return { editedFields: rows.map((r) => r.fieldName) };
    }),
});
