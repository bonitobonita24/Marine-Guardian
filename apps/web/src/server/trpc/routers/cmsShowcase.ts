import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { platformAdminProcedure } from "../middleware/require-platform-admin";
import { prisma, writeAuditLog, Prisma, type PrismaClient } from "@marine-guardian/db";

/**
 * cmsShowcase router — WYSIWYG CMS content layer for the public /showcase
 * page (CMS_BUILD_PLAN.md — W3). Content is GLOBAL (not tenant-scoped):
 * `getAll` is `publicProcedure` (the /showcase page is public, unauthenticated
 * — see middleware.ts publicPaths), `update` is `platformAdminProcedure`
 * (role `tenant_manager` + empty tenantId — CMS_BUILD_PLAN.md "Edit gate").
 *
 * Keys are the stable dotted ids seeded by packages/db/prisma/seed-cms.ts
 * (hero.headline, feature.<id>.title, etc.) — W5 reads these back in with a
 * fallback to the current literal when a key is missing.
 */
export const cmsShowcaseRouter = router({
  /**
   * All showcase fields as a key -> {value, valueJson} map. A map (not an
   * array) so W5 call sites can do `fields["hero.headline"]?.value` directly
   * against the seeded/edited key without a client-side index pass.
   */
  getAll: publicProcedure.query(async () => {
    const rows = await prisma.showcaseField.findMany({
      select: { key: true, value: true, valueJson: true },
    });
    const fields: Record<string, { value: string; valueJson: unknown }> = {};
    for (const row of rows) {
      fields[row.key] = { value: row.value, valueJson: row.valueJson };
    }
    return fields;
  }),

  /** Create-or-update one field by key (upsert — new keys may be introduced by the editor, W6). */
  update: platformAdminProcedure
    .input(
      z.object({
        key: z.string().min(1).max(300),
        value: z.string().max(50_000),
        valueJson: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await prisma.showcaseField.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          value: input.value,
          ...(input.valueJson !== undefined && {
            valueJson: input.valueJson as Prisma.InputJsonValue,
          }),
          updatedById: ctx.userId,
        },
        update: {
          value: input.value,
          ...(input.valueJson !== undefined && {
            valueJson: input.valueJson as Prisma.InputJsonValue,
          }),
          updatedById: ctx.userId,
        },
      });
      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: null,
        userId: ctx.userId,
        action: "CMS_SHOWCASE_FIELD_UPDATE",
        entityType: "ShowcaseField",
        entityId: row.id,
        changesJson: { key: row.key },
      });
      return row;
    }),
});
