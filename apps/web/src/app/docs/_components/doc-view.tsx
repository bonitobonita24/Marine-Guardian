import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getDocPage } from "@/lib/docs/source";

import { docsMarkdownComponents } from "./markdown-components";

// Shared server-side docs renderer used by both app/docs/page.tsx (index,
// slug=[]) and app/docs/[...slug]/page.tsx. Resolves the DB-backed markdown
// for the slug (CMS_BUILD_PLAN.md W4 — src/lib/docs/source.ts reads Postgres,
// not the filesystem) and renders the body with react-markdown + remark-gfm
// (GFM tables/strikethrough/task-lists) into a centered reading column
// (Entry-1: mx-auto max-w-3xl, applied by the docs layout).

export async function DocView({ slug = [] }: { slug?: string[] }) {
  const page = await getDocPage(slug);
  if (!page) notFound();

  return (
    <article className="w-full">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          {page.frontmatter.title}
        </h1>
        {page.frontmatter.description != null && page.frontmatter.description !== "" ? (
          <p className="mt-3 text-lg text-muted-foreground">{page.frontmatter.description}</p>
        ) : null}
      </header>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={docsMarkdownComponents}>
        {page.source}
      </ReactMarkdown>
    </article>
  );
}
