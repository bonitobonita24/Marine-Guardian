import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { platformAdminProcedure } from "../middleware/require-platform-admin";
import { prisma, writeAuditLog, type PrismaClient } from "@marine-guardian/db";

/**
 * cmsDocs router — WYSIWYG CMS content layer for the public /docs site
 * (CMS_BUILD_PLAN.md — W3). Content is GLOBAL (not tenant-scoped): reads are
 * `publicProcedure` (the /docs pages are public, unauthenticated routes —
 * see middleware.ts publicPaths), writes are `platformAdminProcedure` (role
 * `tenant_manager` + empty tenantId — CMS_BUILD_PLAN.md "Edit gate").
 *
 * `slug` is the flat DB key exactly matching the derivation in
 * packages/db/prisma/seed-cms.ts / apps/web/src/lib/docs/source.ts:
 *   - root page                    -> "index"            (parentSlug: null)
 *   - top-level folder/page        -> "<name>"            (parentSlug: "index")
 *   - nested page under a folder   -> "<folder>/<name>"    (parentSlug: "<folder>")
 * W4 replaces the filesystem read path in src/lib/docs/source.ts with these
 * queries; `tree`/`getBySlug` are shaped to be a drop-in equivalent of the
 * existing DocsTreeNode / ResolvedDocPage consumers.
 */

const docPageKindSchema = z.enum(["page", "folderIndex"]);

const ROOT_SLUG = "index";

export interface CmsDocTreeNode {
  slug: string;
  title: string;
  description: string | null;
  kind: "page" | "folderIndex";
  url: string;
  orderInParent: number;
  children: CmsDocTreeNode[];
}

function urlForSlug(slug: string): string {
  return slug === ROOT_SLUG ? "/docs" : `/docs/${slug}`;
}

interface DocPageRow {
  slug: string;
  parentSlug: string | null;
  kind: "page" | "folderIndex";
  title: string;
  description: string | null;
  orderInParent: number;
}

function buildDocTree(rootSlug: string, byParent: Map<string, DocPageRow[]>): CmsDocTreeNode[] {
  const children = byParent.get(rootSlug) ?? [];
  return [...children]
    .sort((a, b) => a.orderInParent - b.orderInParent || a.slug.localeCompare(b.slug))
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      kind: row.kind,
      url: urlForSlug(row.slug),
      orderInParent: row.orderInParent,
      children: buildDocTree(row.slug, byParent),
    }));
}

export const cmsDocsRouter = router({
  /**
   * Full published nav tree, shaped as the TOP-LEVEL children of the root
   * ("index") page — mirrors `getDocsTree()` in src/lib/docs/source.ts
   * (which returns children of DOCS_ROOT, not a node for DOCS_ROOT itself).
   */
  tree: publicProcedure.query(async () => {
    const rows = await prisma.docPage.findMany({
      where: { published: true },
      select: {
        slug: true,
        parentSlug: true,
        kind: true,
        title: true,
        description: true,
        orderInParent: true,
      },
      orderBy: { orderInParent: "asc" },
    });

    const byParent = new Map<string, DocPageRow[]>();
    for (const row of rows) {
      if (row.parentSlug === null) continue; // root itself has no parent bucket
      const bucket = byParent.get(row.parentSlug) ?? [];
      bucket.push(row);
      byParent.set(row.parentSlug, bucket);
    }

    return buildDocTree(ROOT_SLUG, byParent);
  }),

  /** Resolve one published page by its flat slug ("index" for the root page). */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(500) }))
    .query(async ({ input }) => {
      const row = await prisma.docPage.findUnique({ where: { slug: input.slug } });
      if (row === null || !row.published) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return row;
    }),

  create: platformAdminProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(500),
        parentSlug: z.string().max(500).nullable(),
        kind: docPageKindSchema.default("page"),
        title: z.string().min(1).max(300),
        description: z.string().max(1000).optional(),
        orderInParent: z.number().int().min(0).default(0),
        bodyMarkdown: z.string().max(2_000_000).default(""),
        published: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await prisma.docPage.create({
        data: {
          slug: input.slug,
          parentSlug: input.parentSlug,
          kind: input.kind,
          title: input.title,
          description: input.description ?? null,
          orderInParent: input.orderInParent,
          bodyMarkdown: input.bodyMarkdown,
          published: input.published,
          updatedById: ctx.userId,
        },
      });
      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: null,
        userId: ctx.userId,
        action: "CMS_DOC_PAGE_CREATE",
        entityType: "DocPage",
        entityId: row.id,
        changesJson: { slug: row.slug },
      });
      return row;
    }),

  update: platformAdminProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(500),
        parentSlug: z.string().max(500).nullable().optional(),
        kind: docPageKindSchema.optional(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(1000).nullable().optional(),
        orderInParent: z.number().int().min(0).optional(),
        bodyMarkdown: z.string().max(2_000_000).optional(),
        published: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.docPage.findUnique({ where: { slug: input.slug } });
      if (existing === null) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const { slug, ...patch } = input;
      const row = await prisma.docPage.update({
        where: { slug },
        data: {
          ...(patch.parentSlug !== undefined && { parentSlug: patch.parentSlug }),
          ...(patch.kind !== undefined && { kind: patch.kind }),
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.description !== undefined && { description: patch.description }),
          ...(patch.orderInParent !== undefined && { orderInParent: patch.orderInParent }),
          ...(patch.bodyMarkdown !== undefined && { bodyMarkdown: patch.bodyMarkdown }),
          ...(patch.published !== undefined && { published: patch.published }),
          updatedById: ctx.userId,
        },
      });
      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: null,
        userId: ctx.userId,
        action: "CMS_DOC_PAGE_UPDATE",
        entityType: "DocPage",
        entityId: row.id,
        changesJson: { slug: row.slug, fields: Object.keys(patch) },
      });
      return row;
    }),

  delete: platformAdminProcedure
    .input(z.object({ slug: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.docPage.findUnique({ where: { slug: input.slug } });
      if (existing === null) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await prisma.docPage.delete({ where: { slug: input.slug } });
      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: null,
        userId: ctx.userId,
        action: "CMS_DOC_PAGE_DELETE",
        entityType: "DocPage",
        entityId: existing.id,
        changesJson: { slug: existing.slug },
      });
      return { slug: input.slug };
    }),

  /** Bulk-update sibling ordering (drag-reorder in the sidebar, W6). */
  reorder: platformAdminProcedure
    .input(
      z.object({
        items: z
          .array(z.object({ slug: z.string().min(1).max(500), orderInParent: z.number().int().min(0) }))
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await prisma.$transaction(
        input.items.map((item) =>
          prisma.docPage.update({
            where: { slug: item.slug },
            data: { orderInParent: item.orderInParent, updatedById: ctx.userId },
          }),
        ),
      );
      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId: null,
        userId: ctx.userId,
        action: "CMS_DOC_PAGE_REORDER",
        entityType: "DocPage",
        entityId: "bulk",
        changesJson: { slugs: input.items.map((i) => i.slug) },
      });
      return { count: input.items.length };
    }),
});
