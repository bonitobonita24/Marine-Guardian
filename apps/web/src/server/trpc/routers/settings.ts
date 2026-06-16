/**
 * Tenant Settings router — EarthRanger connection management.
 *
 * Security invariants:
 *   L3  — all writes gated to adminProcedure (super_admin | site_admin)
 *   L5  — writes audited via writeAuditLog
 *   L6  — tenant-scoped: every query/mutation carries ctx.tenantId guard
 *   Credential safety — apiToken is encrypted at rest with AES-256-GCM using
 *         ENCRYPTION_KEY from server env; the plaintext is NEVER returned to
 *         the client after the initial save (masked output only).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma, encrypt, decrypt, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";

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
      error: `EarthRanger returned HTTP ${res.status} ${res.statusText}`,
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
  upsertErConnection: adminProcedure
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
  testErConnection: adminProcedure.mutation(async ({ ctx }) => {
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
});
