import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";

// Mirror of the schema.prisma DsrType / DsrStatus enums. Kept as local literal
// unions because the @marine-guardian/db barrel re-exports only PrismaClient +
// the Prisma namespace, not the generated enum value-types.
type DsrType = "inform" | "access" | "rectify" | "erasure" | "object" | "port";
type DsrStatus = "received" | "in_progress" | "completed" | "rejected";
import { protectedProcedure } from "../trpc";
import { router } from "../trpc";
import { adminProcedure } from "../middleware/rbac";

/**
 * DSR (Data Subject Request) router — PH Data Privacy Act (RA 10173) §16 rights.
 *
 * Security invariants:
 *   L3  — all procedures are protectedProcedure (authenticated).
 *   L5  — every mutation is audited via writeAuditLog.
 *   L6  — userId / tenantId are ALWAYS derived from ctx (the session), NEVER
 *         from input, so a caller can only ever act on their own data within
 *         their own tenant. passwordHash is never selected/returned.
 *
 * The six RA 10173 §16 rights, each surfaced as a procedure:
 *   inform         — §16(a) right to be informed (what we hold + why).
 *   access         — §16(c) right to access (a copy of own personal data).
 *   rectify        — §16(d) right to rectification.
 *   requestErasure — §16(e)/(f) right to erasure/blocking — request-and-review.
 *   object         — §16(b)/§18 right to object to processing.
 *   port           — §18 right to data portability (machine-readable export).
 *
 * Statutory response window: 15 calendar days from receipt (owner-ratified
 * 2026-06-21; NPC reasonable-period guidance — adjust per future NPC advisory).
 *
 * Erasure is deliberately request-and-review (status RECEIVED), NOT an immediate
 * self-purge: Marine Guardian retains AuditLog (5 years) and patrol/observation
 * operational records (3 years) under RA 10173 §11(e)/§19 legal-hold + storage-
 * limitation. A site_admin reviews each erasure request against those holds
 * before any account is deactivated (see breach/retention DECISIONS_LOG q-v329-*).
 */

/** Days added to requestedAt to compute dueAt (owner-ratified statutory window). */
const DSR_DUE_DAYS = 15;

/** The extended prisma client (tenant-guard + encryption extensions applied). */
type Db = typeof prisma;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** User columns safe to return to a data subject. NEVER includes passwordHash. */
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  languagePreference: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Create a DataSubjectRequest row + emit an AuditLog entry for a DSR event.
 * Returns the created request id.
 */
async function createDsrRecord(
  db: Db,
  opts: {
    tenantId: string;
    userId: string;
    type: DsrType;
    status: DsrStatus;
    action: string;
    evidenceUrl?: string | null;
  },
): Promise<string> {
  const now = new Date();
  const dueAt = addDays(now, DSR_DUE_DAYS);
  const created = await db.dataSubjectRequest.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      type: opts.type,
      status: opts.status,
      dueAt,
      resolvedAt: opts.status === "completed" ? now : null,
      evidenceUrl: opts.evidenceUrl ?? null,
    },
    select: { id: true },
  });
  await writeAuditLog(db as unknown as PrismaClient, {
    tenantId: opts.tenantId,
    userId: opts.userId,
    action: opts.action,
    entityType: "DataSubjectRequest",
    entityId: created.id,
    severity: "info",
  });
  return created.id;
}

/** Assemble a machine-readable copy of the subject's own personal data. */
async function collectSubjectData(db: Db, tenantId: string, userId: string) {
  const [user, fuelEntries, reportExports, auditLogs, consentLogs, schedules] =
    await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT }),
      db.fuelEntry.findMany({
        where: { tenantId, loggedByUserId: userId },
        select: {
          id: true,
          areaName: true,
          dateReceived: true,
          liters: true,
          totalPrice: true,
          currency: true,
          createdAt: true,
        },
      }),
      db.reportExport.findMany({
        where: { tenantId, requestedByUserId: userId },
        select: {
          id: true,
          reportType: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      db.auditLog.findMany({
        where: { tenantId, userId },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          severity: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.consentLog.findMany({
        where: { tenantId, userId },
        select: {
          id: true,
          purpose: true,
          lawfulBasis: true,
          noticeVersion: true,
          granted: true,
          grantedAt: true,
          withdrawnAt: true,
        },
      }),
      db.patrolSchedule.findMany({
        where: { tenantId, rangerUserId: userId },
        select: {
          id: true,
          rangerName: true,
          scheduledStart: true,
          scheduledEnd: true,
          createdAt: true,
        },
      }),
    ]);

  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
  }

  return { user, fuelEntries, reportExports, auditLogs, consentLogs, schedules };
}

export const dsrRouter = router({
  /**
   * dsr.inform — Right to be Informed (RA 10173 §16(a)).
   * Returns the categories of personal data Marine Guardian processes about the
   * caller and the lawful basis — without exporting the data itself. Read-only.
   */
  inform: protectedProcedure.query(() => {
    return {
      controller: "Marine Guardian (operated by the conservation organisation)",
      categories: [
        {
          category: "Account & profile",
          examples: ["name", "email", "role", "language preference"],
          lawfulBasis: "contract",
        },
        {
          category: "Operational activity",
          examples: [
            "patrol schedules you are assigned to",
            "fuel entries you logged",
            "report exports you requested",
          ],
          lawfulBasis: "legitimate_interest",
        },
        {
          category: "Security & audit",
          examples: ["audit-log entries for actions you performed"],
          lawfulBasis: "legal_obligation",
        },
      ],
      retention: [
        { category: "Audit & security logs", period: "5 years" },
        { category: "Operational / patrol / observation data", period: "3 years" },
      ],
      rights: ["inform", "access", "rectify", "erasure", "object", "port"],
    };
  }),

  /**
   * dsr.access — Right to Access (RA 10173 §16(c)).
   * Returns a copy of the subject's own personal data + records the request.
   */
  access: protectedProcedure.mutation(async ({ ctx }) => {
    const { userId, tenantId } = ctx;
    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
    }
    const data = await collectSubjectData(prisma, tenantId, userId);
    await createDsrRecord(prisma, {
      tenantId,
      userId,
      type: "access",
      status: "completed",
      action: "dsr.access",
    });
    return data;
  }),

  /**
   * dsr.port — Right to Data Portability (RA 10173 §18).
   * Same payload as access but explicitly framed as a portable export; records
   * a PORT request. (Client downloads the returned JSON.)
   */
  port: protectedProcedure.mutation(async ({ ctx }) => {
    const { userId, tenantId } = ctx;
    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
    }
    const data = await collectSubjectData(prisma, tenantId, userId);
    await createDsrRecord(prisma, {
      tenantId,
      userId,
      type: "port",
      status: "completed",
      action: "dsr.port",
    });
    return {
      format: "application/json",
      exportedAt: new Date().toISOString(),
      data,
    };
  }),

  /**
   * dsr.rectify — Right to Rectification (RA 10173 §16(d)).
   * Updates the caller's own profile (fullName and/or email). An email change
   * bumps securityVersion (invalidates existing sessions) per security.md.
   */
  rectify: protectedProcedure
    .input(
      z
        .object({
          fullName: z.string().trim().min(1).max(200).optional(),
          email: z.string().trim().email().max(320).optional(),
        })
        .refine((v) => v.fullName !== undefined || v.email !== undefined, {
          message: "Provide at least one field to update.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }

      if (input.email !== undefined) {
        const conflict = await prisma.user.findFirst({
          where: { email: input.email, id: { not: userId } },
          select: { id: true },
        });
        if (conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That email is already in use.",
          });
        }
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.email !== undefined
            ? { email: input.email, securityVersion: { increment: 1 } }
            : {}),
        },
        select: SAFE_USER_SELECT,
      });

      await createDsrRecord(prisma, {
        tenantId,
        userId,
        type: "rectify",
        status: "completed",
        action: "dsr.rectify",
      });

      return updated;
    }),

  /**
   * dsr.object — Right to Object (RA 10173 §16(b)/§18).
   * Records a standing objection to a named processing purpose for site_admin
   * review (status RECEIVED). Does not itself stop processing — a human reviews
   * the objection against legitimate-interest / legal-obligation grounds.
   */
  object: protectedProcedure
    .input(z.object({ purpose: z.string().trim().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }
      const id = await createDsrRecord(prisma, {
        tenantId,
        userId,
        type: "object",
        status: "received",
        action: "dsr.object",
      });
      // Record the objected-to purpose on a consent ledger row for traceability.
      await prisma.consentLog.create({
        data: {
          tenantId,
          userId,
          purpose: input.purpose,
          lawfulBasis: "consent",
          noticeVersion: "v1",
          granted: false,
        },
      });
      return { requestId: id, status: "received" as const };
    }),

  /**
   * dsr.requestErasure — Right to Erasure / Blocking (RA 10173 §16(e)/(f)).
   * Request-and-review: creates a RECEIVED request for a site_admin to action.
   * Immediate self-purge is intentionally NOT done because audit logs (5yr) and
   * operational records (3yr) are under legal-hold / storage-limitation rules;
   * a human must reconcile the erasure against those holds first.
   */
  requestErasure: protectedProcedure
    .input(z.object({ reason: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }
      const id = await createDsrRecord(prisma, {
        tenantId,
        userId,
        type: "erasure",
        status: "received",
        action: "dsr.requestErasure",
        evidenceUrl: input.reason ?? null,
      });
      return { requestId: id, status: "received" as const };
    }),

  /**
   * dsr.adminList — site_admin view of all DSRs in the tenant (review queue).
   * Tenant-scoped via ctx.tenantId; admin-gated via adminProcedure (L3).
   */
  adminList: adminProcedure
    .input(
      z
        .object({
          status: z
            .enum(["received", "in_progress", "completed", "rejected"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }
      return prisma.dataSubjectRequest.findMany({
        where: {
          tenantId,
          ...(input?.status ? { status: input.status } : {}),
        },
        select: {
          id: true,
          type: true,
          status: true,
          requestedAt: true,
          dueAt: true,
          resolvedAt: true,
          evidenceUrl: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { requestedAt: "desc" },
      });
    }),

  /**
   * dsr.adminUpdateStatus — site_admin advances a DSR through its lifecycle.
   * Tenant-scoped + admin-gated + audited. Sets resolvedAt when terminal.
   */
  adminUpdateStatus: adminProcedure
    .input(
      z.object({
        requestId: z.string().min(1),
        status: z.enum(["received", "in_progress", "completed", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }
      const existing = await prisma.dataSubjectRequest.findFirst({
        where: { id: input.requestId, tenantId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
      }
      const terminal = input.status === "completed" || input.status === "rejected";
      const updated = await prisma.dataSubjectRequest.update({
        where: { id: input.requestId },
        data: {
          status: input.status,
          resolvedAt: terminal ? new Date() : null,
        },
        select: {
          id: true,
          type: true,
          status: true,
          requestedAt: true,
          dueAt: true,
          resolvedAt: true,
        },
      });
      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId,
        action: "dsr.updateStatus",
        entityType: "DataSubjectRequest",
        entityId: updated.id,
        changesJson: { status: input.status },
        severity: "info",
      });
      return updated;
    }),

  /**
   * dsr.myRequests — list the caller's own DSR history (tenant + user scoped).
   */
  myRequests: protectedProcedure.query(async ({ ctx }) => {
    const { userId, tenantId } = ctx;
    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
    }
    return prisma.dataSubjectRequest.findMany({
      where: { tenantId, userId },
      select: {
        id: true,
        type: true,
        status: true,
        requestedAt: true,
        dueAt: true,
        resolvedAt: true,
        evidenceUrl: true,
      },
      orderBy: { requestedAt: "desc" },
    });
  }),
});
