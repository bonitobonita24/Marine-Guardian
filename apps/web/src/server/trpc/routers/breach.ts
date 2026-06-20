import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import { router } from "../trpc";
import { adminProcedure } from "../middleware/rbac";

/**
 * Breach-notification router — NPC Circular 16-03 (PH Data Privacy Act RA 10173).
 *
 * Admin-only (super_admin | site_admin via adminProcedure, L3). Tenant-scoped
 * via ctx.tenantId (L6). Every mutation audited via writeAuditLog (L5).
 *
 * Lifecycle: DETECTED → ASSESSED → NOTIFIED (NPC + subjects) → REPORTED → CLOSED.
 *
 * Statutory windows:
 *   72 hours       — initial notification to NPC after detection (Circular 16-03 §5).
 *   5 business days — full written report after the initial notification.
 *
 * writtenReportDueAt is pre-computed at record time as
 *   detectedAt + 72h + 5 business days
 * so SLA dashboards / reminders can query cheaply without recomputing business-day
 * arithmetic at read time.
 */

type Db = PrismaClient;

/**
 * Add N business days (Mon–Fri) to a date. PH public holidays are not modelled
 * here — the DPO tracks those manually.
 */
function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--; // skip Sun (0) + Sat (6)
  }
  return d;
}

/** detectedAt + 72h (NPC notify deadline) + 5 business days (written report). */
function computeWrittenReportDueAt(detectedAt: Date): Date {
  const initialNotifyDeadline = new Date(
    detectedAt.getTime() + 72 * 60 * 60 * 1000,
  );
  return addBusinessDays(initialNotifyDeadline, 5);
}

const BREACH_SELECT = {
  id: true,
  severity: true,
  status: true,
  detectedAt: true,
  npcNotifiedAt: true,
  subjectsNotifiedAt: true,
  writtenReportDueAt: true,
  writtenReportSubmittedAt: true,
  affectedUserCount: true,
  description: true,
  recordedByUserId: true,
  createdAt: true,
} as const;

/** Load a tenant-scoped breach record or throw NOT_FOUND. */
async function requireBreach(tenantId: string, breachId: string) {
  const existing = await prisma.breachNotificationRecord.findFirst({
    where: { id: breachId, tenantId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Breach record not found." });
  }
  return existing;
}

export const breachRouter = router({
  /**
   * breach.record — Record a newly detected personal-data breach.
   * Computes writtenReportDueAt = detectedAt + 72h + 5 business days.
   */
  record: adminProcedure
    .input(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        detectedAt: z.coerce.date(),
        affectedUserCount: z.number().int().nonnegative(),
        description: z.string().trim().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }

      const writtenReportDueAt = computeWrittenReportDueAt(input.detectedAt);

      const breach = await prisma.breachNotificationRecord.create({
        data: {
          tenantId,
          severity: input.severity,
          status: "detected",
          detectedAt: input.detectedAt,
          writtenReportDueAt,
          affectedUserCount: input.affectedUserCount,
          description: input.description,
          recordedByUserId: userId,
        },
        select: BREACH_SELECT,
      });

      await writeAuditLog(prisma as unknown as Db, {
        tenantId,
        userId,
        action: "breach.record",
        entityType: "BreachNotificationRecord",
        entityId: breach.id,
        changesJson: {
          severity: input.severity,
          affectedUserCount: input.affectedUserCount,
          writtenReportDueAt: writtenReportDueAt.toISOString(),
        },
        severity: "high",
      });

      return breach;
    }),

  /**
   * breach.markNpcNotified — record NPC notification within the 72h window.
   * Transitions status to NOTIFIED.
   */
  markNpcNotified: adminProcedure
    .input(z.object({ breachId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }
      await requireBreach(tenantId, input.breachId);

      const now = new Date();
      const breach = await prisma.breachNotificationRecord.update({
        where: { id: input.breachId },
        data: { npcNotifiedAt: now, status: "notified" },
        select: BREACH_SELECT,
      });

      await writeAuditLog(prisma as unknown as Db, {
        tenantId,
        userId,
        action: "breach.notify.npc",
        entityType: "BreachNotificationRecord",
        entityId: breach.id,
        changesJson: { npcNotifiedAt: now.toISOString() },
        severity: "high",
      });

      return breach;
    }),

  /**
   * breach.markSubjectsNotified — record that affected data subjects were notified.
   */
  markSubjectsNotified: adminProcedure
    .input(z.object({ breachId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }
      await requireBreach(tenantId, input.breachId);

      const now = new Date();
      const breach = await prisma.breachNotificationRecord.update({
        where: { id: input.breachId },
        data: { subjectsNotifiedAt: now },
        select: BREACH_SELECT,
      });

      await writeAuditLog(prisma as unknown as Db, {
        tenantId,
        userId,
        action: "breach.notify.subjects",
        entityType: "BreachNotificationRecord",
        entityId: breach.id,
        changesJson: { subjectsNotifiedAt: now.toISOString() },
        severity: "info",
      });

      return breach;
    }),

  /**
   * breach.submitReport — record submission of the full written report to NPC.
   * Transitions status to REPORTED.
   */
  submitReport: adminProcedure
    .input(z.object({ breachId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }
      await requireBreach(tenantId, input.breachId);

      const now = new Date();
      const breach = await prisma.breachNotificationRecord.update({
        where: { id: input.breachId },
        data: { writtenReportSubmittedAt: now, status: "reported" },
        select: BREACH_SELECT,
      });

      await writeAuditLog(prisma as unknown as Db, {
        tenantId,
        userId,
        action: "breach.report.submit",
        entityType: "BreachNotificationRecord",
        entityId: breach.id,
        changesJson: { writtenReportSubmittedAt: now.toISOString() },
        severity: "high",
      });

      return breach;
    }),

  /**
   * breach.list — admin breach register for the tenant, newest first.
   */
  list: adminProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx;
    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
    }
    return prisma.breachNotificationRecord.findMany({
      where: { tenantId },
      select: BREACH_SELECT,
      orderBy: { detectedAt: "desc" },
    });
  }),
});
