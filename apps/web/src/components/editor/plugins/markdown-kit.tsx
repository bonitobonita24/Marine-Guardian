import { MarkdownPlugin } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown round-trip plugin for the CMS editor (CMS_BUILD_PLAN.md — W6).
 * Deliberately LEANER than the shadcn @plate/markdown-kit default (which
 * also wires remark-mdx + remark-mention + remark-math + remark-emoji +
 * footnote plugins): this app's DocPage.bodyMarkdown / ShowcaseField.value
 * are plain GFM markdown (CMS_BUILD_PLAN.md — "Body = Markdown (GFM)"), and
 * remark-mdx in particular risks the same MDX literal-char trap the plan
 * explicitly avoided on the PUBLIC render side (react-markdown, not
 * compileMDX) — a stray `<` or `{` in admin-authored copy would otherwise
 * fail to parse. Only remark-gfm is enabled, matching the public
 * react-markdown + remark-gfm render pipeline exactly (tables, strikethrough,
 * task lists, autolinks) so what the editor round-trips is what /docs and
 * /showcase actually render.
 */
export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm],
    },
  }),
];
