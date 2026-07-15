import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";

import { getDocPage, type DocFrontmatter } from "@/lib/docs/source";

import { docsMdxComponents } from "./mdx-components";

// Shared server-side docs renderer used by both app/docs/page.tsx (index,
// slug=[]) and app/docs/[...slug]/page.tsx. Resolves the MDX for the slug,
// compiles it in an RSC (next-mdx-remote/rsc + remark-gfm), and renders the
// body into a centered reading column (Entry-1: mx-auto max-w-3xl).

export async function DocView({ slug = [] }: { slug?: string[] }) {
  const page = getDocPage(slug);
  if (!page) notFound();

  const { content } = await compileMDX<DocFrontmatter>({
    source: page.source,
    options: {
      parseFrontmatter: true,
      mdxOptions: { remarkPlugins: [remarkGfm] },
    },
    components: docsMdxComponents,
  });

  return (
    <article className="w-full">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {page.frontmatter.title}
        </h1>
        {page.frontmatter.description != null && page.frontmatter.description !== "" ? (
          <p className="mt-2 text-base text-muted-foreground">{page.frontmatter.description}</p>
        ) : null}
      </header>
      {content}
    </article>
  );
}
