import type { Metadata } from "next";

import { getDocPage } from "@/lib/docs/source";

import { DocView } from "./_components/doc-view";

// /docs index — renders content/docs/index.mdx (slug = []).
export function generateMetadata(): Metadata {
  const page = getDocPage([]);
  return {
    title: page ? `${page.frontmatter.title} · Marine Guardian Docs` : "Marine Guardian Docs",
    description: page?.frontmatter.description,
  };
}

export default function DocsIndexPage() {
  return <DocView slug={[]} />;
}
