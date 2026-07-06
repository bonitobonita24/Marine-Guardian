import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
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
 *   areaName  — municipality / area (string exact match, case-insensitive). Kept for
 *               backward compatibility with /api/exports/events, which still builds
 *               its own explicit `areaName` where-clause. The Events list UI now uses
 *               `search` instead (see below) — both filters may be supplied together.
 *   dateFrom  — ISO date string; filters reportedAt >= dateFrom (monthly-accomplishment gate)
 *   dateTo    — ISO date string; filters reportedAt <= dateTo
 *
 * Events-page fuzzy search (pg_trgm) + Skylight toggle + bulk-resolve harvest:
 *   search          — free-text fuzzy match across scalar text columns AND the
 *                      eventDetailsJson/notesJson blobs (pg_trgm-accelerated ILIKE).
 *                      When set, `list` switches to a raw-SQL query path.
 *   includeSkylight — opt-in toggle (default false) mirroring map.ts's SKY-1 pattern.
 *                      When false (default), Skylight automated vessel-detection
 *                      events stay excluded from the Operations List, same as before.
 */
export const eventListFilters = z.object({
  state: z.enum(["new_event", "active", "resolved"]).optional(),
  // BUG-2 FIX: EarthRanger stores raw priority values (0, 100, 200, 300) in
  // the Event.priority column — no upper cap. Removed max(3) which was a
  // leftover from a draft 0-3 local-only scale that was never actually used.
  priority: z.number().int().min(0).optional(),
  // M3 — new server-side filters for Operations List
  category: z.string().max(200).optional(),
  areaName: z.string().max(200).optional(),
  // War Room breakdown drill-down (T5b): filter by the joined eventType.display
  // label (exact, case-insensitive) so clicking a breakdown bar lists the events
  // of exactly that event type. Distinct from `category`, which groups types.
  typeDisplay: z.string().max(200).optional(),
  dateFrom: z.string().optional(), // ISO date, inclusive lower bound on reportedAt
  dateTo: z.string().optional(),   // ISO date, inclusive upper bound on reportedAt
  // event-patrol-link — Command Center "Active Events" drilldown: restrict to
  // events tied to a currently-open (non-deleted) patrol. Events with no
  // linked patrol (patrolId null) are intentionally excluded when this is true.
  linkedToActivePatrol: z.boolean().optional(),
  // Fuzzy full-content search (pg_trgm) — replaces the old "area / municipality"
  // box in the Events list UI. Matches across all scalar text columns plus the
  // JSON blobs (event_details_json, notes_json), case-insensitively.
  search: z.string().max(500).optional(),
  // Skylight/"Marine Entry" opt-in toggle — mirrors map.ts's includeSkylight
  // (SKY-1). Default false preserves the existing unconditional exclusion.
  includeSkylight: z.boolean().default(false),
});

/**
 * Raw-row shape returned by the listViaSearch $queryRaw below. Column aliases
 * are chosen to match the camelCase Prisma.Event scalar field names 1:1, plus
 * a flattened `eventType_display` / `eventType_category` pair (re-nested into
 * `{ eventType: { display, category } }` below) so the response shape is
 * IDENTICAL to the `prisma.event.findMany({ include: { eventType: ... } })`
 * path above — the row-render + detail-modal code depends on that shape.
 */
interface RawEventRow {
  id: string;
  tenantId: string;
  erEventId: string;
  eventTypeId: string | null;
  serialNumber: string | null;
  title: string | null;
  priority: number;
  state: "new_event" | "active" | "resolved";
  locationLat: number | null;
  locationLon: number | null;
  reportedByName: string | null;
  reportedAt: Date | null;
  eventDetailsJson: Prisma.JsonValue;
  notesJson: Prisma.JsonValue;
  areaName: string | null;
  offenderName: string | null;
  vesselName: string | null;
  vesselRegistration: string | null;
  address: string | null;
  actionTaken: string | null;
  patrolId: string | null;
  createdAt: Date;
  updatedAt: Date;
  eventType_display: string | null;
  eventType_category: string | null;
}

type ListInput = z.infer<typeof eventListFilters> & {
  cursor?: string | undefined;
  limit: number;
};

/**
 * pg_trgm fuzzy full-content search path for `event.list`.
 *
 * Re-implements the exact same tenant scoping, filter set, ordering, and
 * cursor pagination as the Prisma-fluent path above, but as a hand-written
 * $queryRaw — Prisma's fluent API cannot express an ILIKE across a
 * concatenation of scalar text columns AND the eventDetailsJson/notesJson
 * blobs (cast to text). The `search` value is ALWAYS passed as a bound
 * parameter via Prisma.sql template interpolation (never string-concatenated
 * into the query), so this is not vulnerable to SQL injection.
 *
 * Pagination note: the Prisma path above uses `cursor: { id }` with
 * `orderBy: { createdAt: "desc" }`, which Prisma resolves internally by
 * locating the cursor row's position in that order. Raw SQL has no such
 * primitive, so this re-implements it as standard keyset pagination:
 * `(created_at, id) < (cursorCreatedAt, cursorId)` ordered by
 * `created_at DESC, id DESC` — semantically equivalent (and more stable
 * under createdAt ties) to the original.
 */
async function listViaSearch(
  tenantId: string,
  input: ListInput,
  searchTerm: string,
  dateFromParsed: Date | undefined,
  dateToParsed: Date | undefined,
) {
  const conditions: Prisma.Sql[] = [Prisma.sql`e.tenant_id = ${tenantId}`];

  if (input.state !== undefined) {
    conditions.push(Prisma.sql`e.state = ${input.state}::"EventState"`);
  }
  if (input.priority !== undefined) {
    conditions.push(Prisma.sql`e.priority = ${input.priority}`);
  }
  if (input.category !== undefined) {
    conditions.push(Prisma.sql`et.category ILIKE ${input.category}`);
  }
  if (input.typeDisplay !== undefined) {
    conditions.push(Prisma.sql`et.display ILIKE ${input.typeDisplay}`);
  }
  if (input.areaName !== undefined) {
    conditions.push(Prisma.sql`e.area_name ILIKE ${`%${input.areaName}%`}`);
  }
  if (dateFromParsed !== undefined) {
    conditions.push(Prisma.sql`e.reported_at >= ${dateFromParsed}`);
  }
  if (dateToParsed !== undefined) {
    conditions.push(Prisma.sql`e.reported_at <= ${dateToParsed}`);
  }
  if (input.linkedToActivePatrol === true) {
    conditions.push(Prisma.sql`p.state = 'open' AND p.is_deleted = false`);
  }
  if (!input.includeSkylight) {
    conditions.push(
      Prisma.sql`(et.display IS NULL OR et.display NOT ILIKE '%skylight%')`,
    );
  }
  // The fuzzy match itself — concatenation of every scalar text column plus
  // the two JSON blobs cast to text. The GIN trigram index created in the
  // migration accelerates this ILIKE. The joined event type's display name
  // (et.display, e.g. "Skylight Entry Alert") is deliberately kept OUT of the
  // indexed concat (it lives on a joined relation, not the events table) and
  // OR'd in as a separate predicate instead, so the events-only concat above
  // stays byte-identical to what the GIN trigram index was built against —
  // preserving the planner's BitmapOr branch for the common case — while
  // still closing the gap where a search term matches ONLY the event type
  // name and nothing else on the event.
  conditions.push(Prisma.sql`(
    (
      coalesce(e.title, '') || ' ' ||
      coalesce(e.reported_by_name, '') || ' ' ||
      coalesce(e.offender_name, '') || ' ' ||
      coalesce(e.vessel_name, '') || ' ' ||
      coalesce(e.vessel_registration, '') || ' ' ||
      coalesce(e.address, '') || ' ' ||
      coalesce(e.action_taken, '') || ' ' ||
      coalesce(e.area_name, '') || ' ' ||
      coalesce(e.serial_number, '') || ' ' ||
      coalesce(e.event_details_json::text, '') || ' ' ||
      coalesce(e.notes_json::text, '')
    ) ILIKE ${`%${searchTerm}%`}
    OR coalesce(et.display, '') ILIKE ${`%${searchTerm}%`}
  )`);

  // Keyset cursor — look up the cursor row's createdAt so we can continue the
  // same createdAt DESC ordering the non-search path uses.
  if (input.cursor !== undefined) {
    const cursorRow = await prisma.event.findFirst({
      where: { id: input.cursor, tenantId },
      select: { createdAt: true },
    });
    if (cursorRow) {
      conditions.push(
        Prisma.sql`(e.created_at, e.id) < (${cursorRow.createdAt}, ${input.cursor})`,
      );
    }
  }

  const whereSql = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<RawEventRow[]>(Prisma.sql`
    SELECT
      e.id                        AS "id",
      e.tenant_id                 AS "tenantId",
      e.er_event_id               AS "erEventId",
      e.event_type_id             AS "eventTypeId",
      e.serial_number             AS "serialNumber",
      e.title                     AS "title",
      e.priority                  AS "priority",
      e.state                     AS "state",
      e.location_lat              AS "locationLat",
      e.location_lon              AS "locationLon",
      e.reported_by_name          AS "reportedByName",
      e.reported_at               AS "reportedAt",
      e.event_details_json        AS "eventDetailsJson",
      e.notes_json                AS "notesJson",
      e.area_name                 AS "areaName",
      e.offender_name             AS "offenderName",
      e.vessel_name               AS "vesselName",
      e.vessel_registration       AS "vesselRegistration",
      e.address                   AS "address",
      e.action_taken              AS "actionTaken",
      e.patrol_id                 AS "patrolId",
      e.created_at                AS "createdAt",
      e.updated_at                AS "updatedAt",
      et.display                  AS "eventType_display",
      et.category                 AS "eventType_category"
    FROM events e
    LEFT JOIN event_types et ON et.id = e.event_type_id
    ${input.linkedToActivePatrol === true ? Prisma.sql`JOIN patrols p ON p.id = e.patrol_id` : Prisma.empty}
    WHERE ${whereSql}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ${input.limit + 1}
  `);

  let nextCursor: string | undefined;
  if (rows.length > input.limit) {
    const next = rows.pop();
    nextCursor = next?.id;
  }

  const items = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    erEventId: r.erEventId,
    eventTypeId: r.eventTypeId,
    serialNumber: r.serialNumber,
    title: r.title,
    priority: r.priority,
    state: r.state,
    locationLat: r.locationLat,
    locationLon: r.locationLon,
    reportedByName: r.reportedByName,
    reportedAt: r.reportedAt,
    eventDetailsJson: r.eventDetailsJson,
    notesJson: r.notesJson,
    areaName: r.areaName,
    offenderName: r.offenderName,
    vesselName: r.vesselName,
    vesselRegistration: r.vesselRegistration,
    address: r.address,
    actionTaken: r.actionTaken,
    patrolId: r.patrolId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    eventType:
      r.eventType_display !== null || r.eventType_category !== null
        ? { display: r.eventType_display, category: r.eventType_category }
        : null,
  }));

  return { items, nextCursor };
}

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

      // pg_trgm fuzzy full-content search — Prisma's fluent API can't express
      // an ILIKE across a JSON-cast-to-text + scalar-column concatenation, so
      // when `search` is supplied we drop to a hand-written $queryRaw that
      // re-implements the SAME tenant scoping, filters, ordering, and
      // keyset/cursor pagination as the path below (see listViaSearch).
      const trimmedSearch = input.search?.trim();
      if (trimmedSearch !== undefined && trimmedSearch !== "") {
        return listViaSearch(ctx.tenantId, input, trimmedSearch, dateFromParsed, dateToParsed);
      }

      const items = await prisma.event.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.state    !== undefined ? { state:    input.state    } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          // category / typeDisplay filters — both target the joined eventType
          // relation, so merge them into a single nested `eventType` filter to
          // avoid one key overwriting the other when both are supplied.
          ...(input.category !== undefined || input.typeDisplay !== undefined
            ? {
                eventType: {
                  ...(input.category !== undefined
                    ? { category: { equals: input.category, mode: "insensitive" } }
                    : {}),
                  ...(input.typeDisplay !== undefined
                    ? { display: { equals: input.typeDisplay, mode: "insensitive" } }
                    : {}),
                },
              }
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
          // event-patrol-link — Active Events drilldown filter (q-ops event-patrol-link).
          // Relation filter also excludes events with a null patrolId, which is intended.
          ...(input.linkedToActivePatrol === true
            ? { patrol: { is: { state: "open", isDeleted: false } } }
            : {}),
          // Exclude Skylight automated vessel-detection events from the
          // Operations List by default — defense-in-depth alongside the
          // ER-sync ingestion block (er-sync.processor.ts). Same marker as
          // dashboard.ts:179 / reportMap.ts:59: the joined eventType.display
          // contains "skylight" (case-insensitive). SKY-1: opt back in via
          // `includeSkylight` (mirrors map.ts).
          ...(!input.includeSkylight
            ? { NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } } }
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
          // Stage 4 — Telegram-archived ER assets for the event-detail "Photos"
          // section. Only archived rows (telegramFileId set) are surfaced; the
          // telegramFileId itself is omitted from the select (proxied via
          // /api/assets/[id], never exposed to the client).
          assets: {
            where: { telegramFileId: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { id: true, filename: true, mimeType: true, sizeBytes: true },
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

  /**
   * Bulk state-change mutation backing the Events list "N selected · Mark
   * resolved" bulk-action bar. Tenant-scoped exactly like updateState — the
   * `where` clause always includes `tenantId: ctx.tenantId`, so a request
   * containing another tenant's event ids simply updates zero rows for those
   * ids (Prisma's updateMany never throws for a non-matching id, it just
   * excludes it from `count`).
   */
  bulkUpdateState: tenantProcedure
    .input(
      z.object({
        ids: z.string().array().min(1).max(500),
        state: z.enum(["new_event", "active", "resolved"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await prisma.event.updateMany({
        where: { id: { in: input.ids }, tenantId: ctx.tenantId },
        data: { state: input.state },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "BULK_UPDATE_EVENT_STATE",
        entityType: "Event",
        entityId: input.ids.join(","),
        changesJson: { ids: input.ids, state: input.state, count: result.count },
        ipAddress: ctx.ip,
        severity: "info",
      });

      return result;
    }),

  /**
   * One-time "resolve all existing events" action. Admin-gated (super_admin |
   * site_admin) and tenant-scoped — implemented as a repeatable, audited
   * mutation (not a one-off data migration) so it can be run again safely if
   * new events accumulate before the owner re-triggers it.
   */
  resolveAllEvents: adminProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
    }

    const result = await prisma.event.updateMany({
      where: { tenantId, state: { not: "resolved" } },
      data: { state: "resolved" },
    });

    await writeAuditLog(prisma as unknown as PrismaClient, {
      tenantId,
      userId: ctx.userId,
      action: "RESOLVE_ALL_EVENTS",
      entityType: "Event",
      entityId: "*",
      changesJson: { count: result.count },
      ipAddress: ctx.ip,
      severity: "info",
    });

    return result;
  }),

  update: tenantProcedure
    .input(
      z
        .object({
          id: z.string(),
          // BUG-2b FIX: title must be non-empty when provided — reject blank-
          // wipe attempts.  Other text fields remain freely clearable (they are
          // genuinely optional in the domain; title is the only NOT-NULL-intent
          // field the edit form exposes).
          title: z.string().trim().min(1, "Title is required").max(500).optional(),
          // BUG-2 FIX: removed max(3). EarthRanger priority values are raw
          // integers (0, 100, 200, 300); capping at 3 rejected valid
          // ER-synced events with a silent HTTP 400.
          priority: z.number().int().min(0).optional(),
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
