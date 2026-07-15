import "server-only";

import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

// ---------------------------------------------------------------------------
// Headless docs content source (next-mdx-remote fallback pipeline).
//
// Reads MDX from apps/web/content/docs/** at request time. The nav tree is
// derived from the folder structure and optional per-folder meta.json files;
// page titles come from each MDX file's frontmatter. This is intentionally the
// simple, dependency-light path (no fumadocs-mdx build integration / no
// next.config createMDX plugin / no generated .source dir). The UI on top of
// this is 100% shadcn/ui — see app/docs/_components/docs-sidebar.tsx.
// ---------------------------------------------------------------------------

const DOCS_ROOT = path.join(process.cwd(), "content", "docs");
const BASE_URL = "/docs";

/** Frontmatter contract every docs .mdx file must satisfy. */
export interface DocFrontmatter {
  title: string;
  description?: string | undefined;
}

/** Per-folder meta.json contract (all fields optional). */
interface DocsMeta {
  /** Display title for this folder in the sidebar (falls back to titleized name). */
  title?: string;
  /**
   * Ordering of this folder's direct children by basename (a page file's name
   * without the `.mdx`, or a subfolder name). Unlisted children are appended
   * alphabetically after the listed ones. `index` is never a child — it
   * represents the folder itself.
   */
  pages?: string[];
}

export interface DocsTreeNode {
  type: "page" | "folder";
  title: string;
  /** Route href. Present for pages and for folders that have an index.mdx. */
  url?: string | undefined;
  /** Slug segments relative to /docs. */
  slug: string[];
  children?: DocsTreeNode[];
}

export interface ResolvedDocPage {
  source: string;
  frontmatter: DocFrontmatter;
  slug: string[];
  url: string;
}

// --- helpers ---------------------------------------------------------------

const SLUG_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function titleize(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function readMeta(dir: string): DocsMeta {
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as DocsMeta;
  } catch {
    return {};
  }
}

function readFrontmatter(filePath: string): DocFrontmatter {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = matter(raw);
  const fm = data as Partial<DocFrontmatter>;
  return {
    title: typeof fm.title === "string" ? fm.title : titleize(path.basename(filePath, ".mdx")),
    description: typeof fm.description === "string" ? fm.description : undefined,
  };
}

/** Ordering key: listed names first (in meta order), unlisted appended A→Z. */
function orderer(order: string[]) {
  const rank = new Map<string, number>(order.map((name, i) => [name, i]));
  return (a: string, b: string): number => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  };
}

function urlFor(slug: string[]): string {
  return slug.length > 0 ? `${BASE_URL}/${slug.join("/")}` : BASE_URL;
}

// --- tree ------------------------------------------------------------------

function buildTree(dir: string, parentSlug: string[]): DocsTreeNode[] {
  if (!fs.existsSync(dir)) return [];
  const meta = readMeta(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  const folderNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const pageNames = entries
    .filter((e) => e.isFile() && e.name.endsWith(".mdx") && e.name !== "index.mdx")
    .map((e) => e.name.replace(/\.mdx$/, ""));

  const childNames = [...folderNames, ...pageNames].sort(orderer(meta.pages ?? []));
  const nodes: DocsTreeNode[] = [];

  for (const name of childNames) {
    const slug = [...parentSlug, name];
    if (folderNames.includes(name)) {
      const childDir = path.join(dir, name);
      const childMeta = readMeta(childDir);
      const indexPath = path.join(childDir, "index.mdx");
      const hasIndex = fs.existsSync(indexPath);
      const title =
        childMeta.title ??
        (hasIndex ? readFrontmatter(indexPath).title : undefined) ??
        titleize(name);
      nodes.push({
        type: "folder",
        title,
        url: hasIndex ? urlFor(slug) : undefined,
        slug,
        children: buildTree(childDir, slug),
      });
    } else {
      const fm = readFrontmatter(path.join(dir, `${name}.mdx`));
      nodes.push({ type: "page", title: fm.title, url: urlFor(slug), slug });
    }
  }

  return nodes;
}

/** The full sidebar navigation tree (top-level children of content/docs). */
export function getDocsTree(): DocsTreeNode[] {
  return buildTree(DOCS_ROOT, []);
}

// --- page resolution -------------------------------------------------------

/** Resolve a slug to a concrete .mdx file within DOCS_ROOT, or null. */
function resolveFile(slug: string[]): string | null {
  if (slug.some((seg) => !SLUG_SEGMENT_RE.test(seg) || seg === "..")) return null;

  const base = path.join(DOCS_ROOT, ...slug);
  const candidates =
    slug.length > 0
      ? [`${base}.mdx`, path.join(base, "index.mdx")]
      : [path.join(DOCS_ROOT, "index.mdx")];

  for (const candidate of candidates) {
    // Containment guard: the resolved path must stay inside DOCS_ROOT.
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(path.resolve(DOCS_ROOT) + path.sep)) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  return null;
}

/** Resolve + read a docs page by slug (raw MDX source + frontmatter), or null. */
export function getDocPage(slug: string[] = []): ResolvedDocPage | null {
  const filePath = resolveFile(slug);
  if (filePath == null) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = matter(raw);
  const fm = data as Partial<DocFrontmatter>;
  return {
    source: raw,
    frontmatter: {
      title: typeof fm.title === "string" ? fm.title : titleize(slug.at(-1) ?? "Docs"),
      description: typeof fm.description === "string" ? fm.description : undefined,
    },
    slug,
    url: urlFor(slug),
  };
}
