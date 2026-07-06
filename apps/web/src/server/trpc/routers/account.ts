import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";

const BCRYPT_ROUNDS = 12;

/**
 * Account router — self-service Profile page (2026-07-06).
 *
 * Every procedure here operates ONLY on the authenticated caller (ctx.userId)
 * — never on a userId supplied by input — so a user can change their own
 * password but can never touch another account. This is deliberately
 * separate from userManagementProcedure (rbac.ts), which gates an ADMIN
 * acting on ANOTHER user's account; this router is open to EVERY
 * authenticated role (super_admin, site_admin, administrator,
 * field_coordinator, operator, viewer) via plain protectedProcedure.
 *
 * Own-email change is intentionally NOT duplicated here — dsr.rectify
 * (dsr.ts) already implements it end-to-end (self-only, tenant-uniqueness
 * check, securityVersion bump on email change) as part of the RA 10173
 * data-subject "rectification" right. The Profile page reuses that
 * procedure directly instead of a redundant account.changeOwnEmail.
 */
export const accountRouter = router({
  /**
   * changeOwnPassword — verifies the caller's CURRENT password (bcrypt
   * compare) before hashing + persisting the new one. Bumps securityVersion
   * (L3/security.md), which invalidates every active session for this user —
   * INCLUDING the session making this call, matching the existing admin-driven
   * user.resetPassword behavior (both force a clean re-login rather than
   * leaving stale JWTs valid). The client is expected to sign the user out
   * immediately on success.
   */
  changeOwnPassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, tenantId } = ctx;
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context." });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Current password is incorrect.",
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          securityVersion: { increment: 1 },
        },
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId,
        action: "SELF_CHANGE_PASSWORD",
        entityType: "User",
        entityId: userId,
        ipAddress: ctx.ip,
        severity: "info",
      });

      return { success: true };
    }),
});
