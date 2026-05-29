import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { cookies } from "next/headers";
import { router } from "../trpc";
import { protectedProcedure } from "../trpc";
import { platformPrisma, writeAuditLog } from "@marine-guardian/db";
import {
  IMPERSONATION_COOKIE_NAME,
} from "@/lib/auth/impersonation";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export const platformImpersonationRouter = router({
  enter: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Guard: must be super_admin
      if (!ctx.roles.includes("super_admin")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Guard: must be in platform context (not already impersonating)
      if (ctx.tenantId !== "") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const tenant = await platformPrisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, slug: true, name: true, isActive: true },
      });

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      }
      if (!tenant.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant is inactive." });
      }

      const jar = await cookies();
      jar.set(IMPERSONATION_COOKIE_NAME, tenant.id, buildCookieOptions());

      await writeAuditLog(platformPrisma, {
        tenantId: null,
        userId: ctx.userId,
        action: "PLATFORM:ENTER_TENANT",
        entityType: "Tenant",
        entityId: tenant.id,
        changesJson: {
          targetTenantSlug: tenant.slug,
          targetTenantName: tenant.name,
        },
        ipAddress: ctx.ip,
      });

      return { tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.name };
    }),

  exit: protectedProcedure.mutation(async ({ ctx }) => {
    // Guard: must be super_admin
    if (!ctx.roles.includes("super_admin")) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const jar = await cookies();
    const current = jar.get(IMPERSONATION_COOKIE_NAME)?.value ?? null;

    if (current === null) {
      return { wasImpersonating: false };
    }

    const tenant = await platformPrisma.tenant.findUnique({
      where: { id: current },
      select: { slug: true },
    });

    jar.delete(IMPERSONATION_COOKIE_NAME);

    await writeAuditLog(platformPrisma, {
      tenantId: null,
      userId: ctx.userId,
      action: "PLATFORM:EXIT_TENANT",
      entityType: "Tenant",
      entityId: current,
      changesJson: { targetTenantSlug: tenant?.slug ?? null },
      ipAddress: ctx.ip,
    });

    return { wasImpersonating: true };
  }),
});
