import type { Metadata } from "next";

import { getDocPage } from "@/lib/docs/source";

import { DocView } from "./_components/doc-view";

// /docs index — renders the DB "index" root page (slug = []).
export async function generateMetadata(): Promise<Metadata> {
  const page = await getDocPage([]);
  return {
    title: page ? `${page.frontmatter.title} · Marine Guardian Docs` : "Marine Guardian Docs",
    description: page?.frontmatter.description,
  };
}

export default function DocsIndexPage() {
  return <DocView slug={[]} />;
}
