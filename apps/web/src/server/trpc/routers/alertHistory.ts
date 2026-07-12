/**
 * alertHistory router
 *
 * Security invariants:
 *   L3  — acknowledge mutation gated to adminProcedure (super_admin | site_admin)
 *   L5  — acknowledge mutation audited via writeAuditLog (action: "alertHistory.acknowledge")
 *   L6  — every query/mutation is tenant-scoped via ctx.tenantId
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure, matrixProcedure } from "../middleware/rbac";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient, Prisma } from "@marine-guardian/db";

type Db = PrismaClient;

// Single source of truth for alert-history list filters.
// Re-used by the /api/exports/alert-history Route Handler (SS-4).
export const alertHistoryListFilters = z.object({
  alertRuleId: z.string().optional(),
});

/**
 * Excludes Skylight automated vessel-detection alerts from every user-facing
 * ALERTS & ESCALATIONS surface (owner 2026-07-12: "remove Marine Entry events
 * from Alerts & Escalations"). In the UI these read as "Marine Entry", but in
 * the data they are AlertHistory rows linked to an Event whose eventType is
 * "Skylight Entry Alert" (category `analyzer_event`) — the same automated
 * feed already stripped from the WAR ROOM breakdown and every report
 * aggregation. The only reliable Skylight marker is the eventType display
 * ("Skylight …"), matched case-insensitively.
 *
 * `NOT: { event: { … } }` correctly KEEPS alerts with no linked event (the NOT
 * of a to-one relation condition is satisfied when the relation is null), so
 * legitimate non-Skylight alerts that carry no event are never dropped.
 *
 * Shared by alertHistory.list / .unacknowledgedCount, dashboard.alertStats, and
 * the /api/exports/alert-history Route Handler so the panel, KPI, and export all
 * agree.
 */
export const EXCLUDE_SKYLIGHT_ALERTS = {
  NOT: {
    event: {
      eventType: { display: { contains: "skylight", mode: "insensitive" } },
    },
  },
} satisfies Prisma.AlertHistoryWhereInput;

export const alertHistoryRouter = router({
  list: matrixProcedure(tenantProcedure, "alerts", "view")
    .input(
      alertHistoryListFilters.extend({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        // War Room range filter (2026-06-27): the Command Center passes the
        // active FROM/TO window so the Alerts & Escalations panel follows the
        // same date range as every other dashboard panel. Omitting both keeps
        // the original behaviour (all alerts, newest first).
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const firedAt: { gte?: Date; lte?: Date } = {};
      if (input.dateFrom !== undefined) firedAt.gte = input.dateFrom;
      if (input.dateTo !== undefined) firedAt.lte = input.dateTo;
      const hasRange = firedAt.gte !== undefined || firedAt.lte !== undefined;

      const items = await prisma.alertHistory.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.alertRuleId !== undefined ? { alertRuleId: input.alertRuleId } : {}),
          ...(hasRange ? { firedAt } : {}),
          ...EXCLUDE_SKYLIGHT_ALERTS,
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { firedAt: "desc" },
        include: {
          alertRule: { select: { id: true, name: true } },
          event: { select: { id: true, title: true, serialNumber: true, state: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  /**
   * alertHistory.acknowledge — mark an alert as acknowledged.
   *
   * L3: admin-only (super_admin | site_admin).
   * L5: writes an audit log entry (action: "alertHistory.acknowledge").
   * L6: tenant-scoped — the record must belong to ctx.tenantId.
   * Idempotent: if the alert is already acknowledged the mutation is a no-op
   *   (returns the existing row unchanged, no audit entry written for double-ack).
   */
  acknowledge: matrixProcedure(adminProcedure, "alerts", "update")
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;

      // L6 — tenant context is required (mirrors breach router guard).
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }

      // L6 — verify the record exists and belongs to this tenant.
      const existing = await prisma.alertHistory.findFirst({
        where: { id: input.id, tenantId },
        select: { id: true, acknowledgedAt: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found." });
      }

      // Idempotent — already acknowledged, return early without re-auditing.
      if (existing.acknowledgedAt !== null) {
        return prisma.alertHistory.findFirstOrThrow({
          where: { id: input.id },
          select: {
            id: true,
            tenantId: true,
            acknowledgedAt: true,
            acknowledgedBy: true,
          },
        });
      }

      const now = new Date();
      const updated = await prisma.alertHistory.update({
        where: { id: input.id },
        data: { acknowledgedAt: now, acknowledgedBy: userId },
        select: {
          id: true,
          tenantId: true,
          acknowledgedAt: true,
          acknowledgedBy: true,
        },
      });

      // L5 — audit log.
      await writeAuditLog(prisma as unknown as Db, {
        tenantId,
        userId,
        action: "alertHistory.acknowledge",
        entityType: "AlertHistory",
        entityId: input.id,
        changesJson: { acknowledgedAt: now.toISOString(), acknowledgedBy: userId },
        severity: "info",
      });

      return updated;
    }),

  /**
   * alertHistory.unacknowledgedCount — number of unacknowledged alerts for the
   * tenant fired within the last 24 h. Used by the WAR ROOM 5th KPI tile.
   *
   * L6: tenant-scoped.
   */
  unacknowledgedCount: matrixProcedure(tenantProcedure, "alerts", "view").query(async ({ ctx }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await prisma.alertHistory.count({
      where: {
        tenantId: ctx.tenantId,
        firedAt: { gte: since },
        acknowledgedAt: null,
        ...EXCLUDE_SKYLIGHT_ALERTS,
      },
    });
    return { count };
  }),
});
