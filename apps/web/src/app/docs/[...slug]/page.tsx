import type { Metadata } from "next";

import { getDocPage } from "@/lib/docs/source";

import { DocView } from "../_components/doc-view";

// A docs page addressed by a required catch-all slug, e.g.
// /docs/getting-started/overview → slug ["getting-started","overview"].
// The /docs index (empty slug) is handled by ../page.tsx.

interface Params {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await getDocPage(slug);
  return {
    title: page ? `${page.frontmatter.title} · Marine Guardian Docs` : "Not found · Marine Guardian Docs",
    description: page?.frontmatter.description,
  };
}

export default async function DocsSlugPage({ params }: Params) {
  const { slug } = await params;
  return <DocView slug={slug} />;
}
