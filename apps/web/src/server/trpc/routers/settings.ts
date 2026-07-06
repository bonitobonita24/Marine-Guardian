/**
 * Tenant Settings router — EarthRanger connection management + sync controls.
 *
 * Security invariants:
 *   L3  — all writes gated to siteAdminProcedure (super_admin | site_admin)
 *   L5  — writes audited via writeAuditLog
 *   L6  — tenant-scoped: every query/mutation carries ctx.tenantId guard
 *   Credential safety — apiToken is encrypted at rest with AES-256-GCM using
 *         ENCRYPTION_KEY from server env; the plaintext is NEVER returned to
 *         the client after the initial save (masked output only).
 *
 * ops-milestone-1 additions:
 *   syncNow            — admin-only delta sync trigger (q-ops-05)
 *   updateErSyncConfig — admin-only recurring toggle + interval update
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { siteAdminProcedure } from "../middleware/rbac";
import { prisma, encrypt, decrypt, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import {
  enqueueErSyncWithWatermark,
  scheduleRecurringErSync,
  removeRecurringErSync,
} from "@marine-guardian/jobs";

// Sentinel used instead of plaintext to signal "token already stored, not changing"
const TOKEN_MASKED = "••••••••";

/** Validate a live ER connection by hitting /api/v1.0/subjects/. */
async function probeErConnection(
  baseUrl: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/api/v1.0/subjects/?page_size=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      // Short timeout — this is a UI-triggered check, not a background job
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { ok: true };
    return {
      ok: false,
      error: `EarthRanger returned HTTP ${String(res.status)} ${res.statusText}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Strip the token from the row before sending to the client. */
function maskConnection(row: {
  id: string;
  tenantId: string;
  baseUrl: string;
  apiTokenEnc: string;
  status: string;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // ops-milestone-1 fields (optional so existing callers without them still compile)
  recurringEnabled?: boolean;
  intervalMs?: number;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    baseUrl: row.baseUrl,
    apiTokenMasked: TOKEN_MASKED,
    status: row.status,
    lastValidatedAt: row.lastValidatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // ops-milestone-1 — expose sync config to admin UI (M2 wires the controls)
    recurringEnabled: row.recurringEnabled ?? false,
    intervalMs: row.intervalMs ?? 300_000,
  };
}

export const settingsRouter = router({
  /**
   * Get the tenant's ER connection (masked — token never returned).
   * Available to all tenant users (read-only display).
   */
  getErConnection: tenantProcedure.query(async ({ ctx }) => {
    const conn = await prisma.tenantErConnection.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    if (!conn) return null;
    return maskConnection(conn);
  }),

  /**
   * Upsert the ER connection (base URL + optional new token).
   * Admin-only. Audited.
   *
   * If apiToken is TOKEN_MASKED or omitted the existing encrypted token is
   * preserved unchanged (so admins can update the URL without re-entering the
   * token).
   */
  upsertErConnection: siteAdminProcedure
    .input(
      z.object({
        baseUrl: z.string().url({ message: "Must be a valid URL" }).max(500),
        apiToken: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }

      const existing = await prisma.tenantErConnection.findUnique({
        where: { tenantId },
        select: { id: true, apiTokenEnc: true, baseUrl: true },
      });

      // Determine the token to store
      let tokenEnc: string;
      if (
        input.apiToken === undefined ||
        input.apiToken === "" ||
        input.apiToken === TOKEN_MASKED
      ) {
        if (!existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "API token is required when creating a new connection.",
          });
        }
        // Keep existing encrypted token
        tokenEnc = existing.apiTokenEnc;
      } else {
        tokenEnc = encrypt(input.apiToken);
      }

      const before = existing
        ? { baseUrl: existing.baseUrl, tokenChanged: false }
        : null;

      const conn = await prisma.tenantErConnection.upsert({
        where: { tenantId },
        create: {
          tenantId,
          baseUrl: input.baseUrl,
          apiTokenEnc: tokenEnc,
          status: "unchecked",
        },
        update: {
          baseUrl: input.baseUrl,
          apiTokenEnc: tokenEnc,
          // Reset status so the next test-connection reflects the new creds
          status: "unchecked",
          lastValidatedAt: null,
        },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId: ctx.userId,
        action: "UPSERT_ER_CONNECTION",
        entityType: "TenantErConnection",
        entityId: conn.id,
        changesJson: {
          before,
          after: { baseUrl: input.baseUrl, tokenChanged: input.apiToken !== TOKEN_MASKED && input.apiToken !== undefined },
        },
        severity: "info",
      });

      return maskConnection(conn);
    }),

  /**
   * Test the live ER connection — performs a real HTTP probe to the ER
   * instance and updates status + lastValidatedAt in-place.
   * Admin-only. Audited.
   */
  testErConnection: siteAdminProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
    }

    const conn = await prisma.tenantErConnection.findUnique({
      where: { tenantId },
    });
    if (!conn) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No EarthRanger connection configured for this tenant.",
      });
    }

    const token = decrypt(conn.apiTokenEnc);
    const probe = await probeErConnection(conn.baseUrl, token);
    const newStatus = probe.ok ? "connected" : "error";

    const updated = await prisma.tenantErConnection.update({
      where: { tenantId },
      data: {
        status: newStatus,
        lastValidatedAt: new Date(),
      },
    });

    await writeAuditLog(prisma as unknown as PrismaClient, {
      tenantId,
      userId: ctx.userId,
      action: "TEST_ER_CONNECTION",
      entityType: "TenantErConnection",
      entityId: conn.id,
      changesJson: {
        result: probe.ok ? "success" : "failure",
        error: probe.error ?? null,
      },
      severity: probe.ok ? "info" : "warning",
    });

    return {
      ...maskConnection(updated),
      probeResult: probe,
    };
  }),

  /**
   * ops-milestone-1 (q-ops-05) — Trigger an immediate one-shot delta sync of
   * all ER sync types for the current tenant.
   *
   * Security: admin-only (L3). Audited (L5). Tenant-scoped (L6).
   *
   * Gated on a verified ('connected') ER connection — refuses to enqueue
   * if the connection is not verified, since a sync against a broken endpoint
   * would waste resources and generate misleading failure SyncLog entries.
   *
   * Each sync type is enqueued as a separate BullMQ job via
   * `enqueueErSyncWithWatermark`, which computes the `since` watermark from
   * the last successful SyncLog entry (q-ops-06). The recurring path is
   * unaffected — this is a one-shot trigger independent of the schedule.
   */
  syncNow: siteAdminProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
    }

    const conn = await prisma.tenantErConnection.findUnique({
      where: { tenantId },
      select: { id: true, status: true },
    });
    if (!conn) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No EarthRanger connection configured for this tenant.",
      });
    }
    if (conn.status !== "connected") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "EarthRanger connection is not verified. Run 'Test Connection' first.",
      });
    }

    const syncTypes = [
      "events",
      "patrols",
      "observations",
      "subjects",
      "event_types",
    ] as const;

    const jobIds: string[] = [];
    for (const syncType of syncTypes) {
      const jobId = await enqueueErSyncWithWatermark(
        tenantId,
        ctx.userId,
        syncType,
      );
      jobIds.push(jobId);
    }

    await writeAuditLog(prisma as unknown as PrismaClient, {
      tenantId,
      userId: ctx.userId,
      action: "TRIGGER_ER_SYNC_NOW",
      entityType: "TenantErConnection",
      entityId: conn.id,
      changesJson: { syncTypes, jobIds },
      severity: "info",
    });

    return { enqueued: syncTypes.length, jobIds };
  }),

  /**
   * ops-milestone-1 — Update the per-tenant recurring ER sync configuration:
   * enable/disable the toggle and/or change the polling interval.
   *
   * Security: admin-only (L3). Audited (L5). Tenant-scoped (L6).
   *
   * When enabling: schedules the BullMQ repeatable jobs (gated on verified
   * connection). When disabling: removes them.
   *
   * Interval validation: min 60_000ms (1 min) per PRODUCT.md §Background Jobs.
   *
   * NOTE: The UI controls for this mutation are Milestone 2. This backend
   * mutation is exposed now so M1 can be tested end-to-end via tRPC client
   * or admin scripts without waiting for the UI.
   */
  updateErSyncConfig: siteAdminProcedure
    .input(
      z.object({
        recurringEnabled: z.boolean(),
        intervalMs: z
          .number()
          .int()
          .min(60_000, { message: "Minimum interval is 60 000ms (1 minute)." })
          .max(86_400_000, { message: "Maximum interval is 86 400 000ms (24 hours)." })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }

      const conn = await prisma.tenantErConnection.findUnique({
        where: { tenantId },
        select: { id: true, status: true, recurringEnabled: true, intervalMs: true },
      });
      if (!conn) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No EarthRanger connection configured for this tenant.",
        });
      }

      if (input.recurringEnabled && conn.status !== "connected") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cannot enable recurring sync — ER connection is not verified. Run 'Test Connection' first.",
        });
      }

      const newIntervalMs = input.intervalMs ?? conn.intervalMs;

      const updated = await prisma.tenantErConnection.update({
        where: { tenantId },
        data: {
          recurringEnabled: input.recurringEnabled,
          intervalMs: newIntervalMs,
        },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId: ctx.userId,
        action: "UPDATE_ER_SYNC_CONFIG",
        entityType: "TenantErConnection",
        entityId: conn.id,
        changesJson: {
          before: { recurringEnabled: conn.recurringEnabled, intervalMs: conn.intervalMs },
          after: { recurringEnabled: input.recurringEnabled, intervalMs: newIntervalMs },
        },
        severity: "info",
      });

      // Wire / unwire the BullMQ repeatable scheduler immediately so
      // the change takes effect without requiring a worker restart.
      if (input.recurringEnabled) {
        await scheduleRecurringErSync(tenantId, ctx.userId, newIntervalMs);
      } else {
        await removeRecurringErSync(tenantId);
      }

      return maskConnection(updated);
    }),

  /**
   * M2 — Recent sync log entries for the Settings ER Sync card.
   *
   * Returns the 10 most recent SyncLog rows for this tenant across all sync
   * types, ordered newest-first. Used to render the "Last sync" status table
   * in the UI. Available to all tenant users (read-only display).
   */
  getSyncLogs: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    if (!tenantId) return [];

    return prisma.syncLog.findMany({
      where: { tenantId },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        syncType: true,
        status: true,
        recordsSynced: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
      },
    });
  }),
});
