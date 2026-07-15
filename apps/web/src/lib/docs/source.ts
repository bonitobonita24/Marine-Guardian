import "server-only";

import { prisma } from "@marine-guardian/db";

// ---------------------------------------------------------------------------
// Headless docs content source — DB-backed (CMS_BUILD_PLAN.md W4).
//
// Reads the published DocPage rows from Postgres (cms_doc_pages, seeded from
// the former apps/web/content/docs/** MDX tree — see packages/db/prisma/
// seed-cms.ts) and shapes them into the SAME DocsTreeNode / ResolvedDocPage
// contracts the sidebar (docs-sidebar.tsx) and renderer (doc-view.tsx) always
// consumed, so this file is a drop-in replacement for the prior filesystem
// pipeline — no URL/shape change for callers.
//
// Slug scheme (mirrors the prior filesystem derivation + cmsDocs.ts router):
//   - root page                  -> DB slug "index"           -> url "/docs"
//   - top-level folder/page      -> DB slug "<name>"           -> url "/docs/<name>"
//   - nested page under a folder -> DB slug "<folder>/<name>"  -> url "/docs/<folder>/<name>"
// `DocsTreeNode.slug` / `ResolvedDocPage.slug` stay the ARRAY form
// (["<folder>","<name>"]) that every existing caller expects; the flat DB
// slug is only used internally as the DB key / parent-linkage.
// ---------------------------------------------------------------------------

const BASE_URL = "/docs";
const ROOT_SLUG = "index";

/** Frontmatter-shaped contract every docs page satisfies (was MDX frontmatter, now DB columns). */
export interface DocFrontmatter {
  title: string;
  description?: string | undefined;
}

export interface DocsTreeNode {
  type: "page" | "folder";
  title: string;
  /** Route href. Present for pages and for folders that have an index page. */
  url?: string | undefined;
  /** Slug segments relative to /docs. */
  slug: string[];
  children?: DocsTreeNode[] | undefined;
}

export interface ResolvedDocPage {
  source: string;
  frontmatter: DocFrontmatter;
  slug: string[];
  url: string;
}

// --- slug helpers ------------------------------------------------------------

/** DB flat slug ("index" | "<name>" | "<folder>/<name>") -> route href. */
function urlForFlatSlug(flatSlug: string): string {
  return flatSlug === ROOT_SLUG ? BASE_URL : `${BASE_URL}/${flatSlug}`;
}

/** Slug segments relative to /docs (e.g. ["command-center","war-room"]) -> flat DB slug. */
function flatSlugFor(slug: string[]): string {
  return slug.length === 0 ? ROOT_SLUG : slug.join("/");
}

/** Flat DB slug -> slug segments relative to /docs (root "index" -> []). */
function slugArrayForFlat(flatSlug: string): string[] {
  return flatSlug === ROOT_SLUG ? [] : flatSlug.split("/");
}

// --- tree --------------------------------------------------------------------

interface DocPageRow {
  slug: string;
  parentSlug: string | null;
  kind: "page" | "folderIndex";
  title: string;
  description: string | null;
  orderInParent: number;
}

function buildTree(parentFlatSlug: string, byParent: Map<string, DocPageRow[]>): DocsTreeNode[] {
  const children = byParent.get(parentFlatSlug) ?? [];
  return [...children]
    .sort((a, b) => a.orderInParent - b.orderInParent || a.slug.localeCompare(b.slug))
    .map((row) => {
      const grandchildren = buildTree(row.slug, byParent);
      const hasChildren = grandchildren.length > 0;
      return {
        type: hasChildren || row.kind === "folderIndex" ? "folder" : "page",
        title: row.title,
        url: urlForFlatSlug(row.slug),
        slug: slugArrayForFlat(row.slug),
        children: hasChildren ? grandchildren : undefined,
      } satisfies DocsTreeNode;
    });
}

/** The full sidebar navigation tree (top-level children of the "index" root). */
export async function getDocsTree(): Promise<DocsTreeNode[]> {
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
    if (row.parentSlug === null) continue; // the root itself has no parent bucket
    const bucket = byParent.get(row.parentSlug) ?? [];
    bucket.push(row);
    byParent.set(row.parentSlug, bucket);
  }

  return buildTree(ROOT_SLUG, byParent);
}

// --- page resolution -----------------------------------------------------------

/** Resolve + read a published docs page by slug (raw markdown source + frontmatter), or null. */
export async function getDocPage(slug: string[] = []): Promise<ResolvedDocPage | null> {
  const flatSlug = flatSlugFor(slug);
  const row = await prisma.docPage.findUnique({ where: { slug: flatSlug } });
  if (row === null || !row.published) return null;

  return {
    source: row.bodyMarkdown,
    frontmatter: {
      title: row.title,
      description: row.description ?? undefined,
    },
    slug,
    url: urlForFlatSlug(flatSlug),
  };
}
