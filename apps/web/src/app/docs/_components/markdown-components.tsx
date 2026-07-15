import type { Components } from "react-markdown";
import Link from "next/link";

import { cn } from "@/lib/utils";

// Token-styled react-markdown element map (CMS_BUILD_PLAN.md W4 — replaces
// the former next-mdx-remote `docsMdxComponents` in mdx-components.tsx 1:1,
// same class list). Everything inherits shadcn design tokens
// (text-foreground / text-muted-foreground / bg-muted / border-border / primary)
// — no hardcoded colors, no second CSS system. Docs images are same-origin
// absolute paths (CSP img-src 'self' covers these). react-markdown passes an
// extra `node` prop to every component — destructured out and unused, never
// forwarded to the DOM.

export const docsMarkdownComponents: Components = {
  h1: ({ className, node: _node, ...props }) => (
    <h1
      className={cn("mt-2 scroll-m-20 text-4xl font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h2
      className={cn(
        "mt-12 scroll-m-20 border-b border-border pb-2 text-2xl font-semibold tracking-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3
      className={cn("mt-8 scroll-m-20 text-xl font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  ),
  p: ({ className, node: _node, ...props }) => (
    <p className={cn("text-lg leading-8 text-foreground [&:not(:first-child)]:mt-6", className)} {...props} />
  ),
  ul: ({ className, node: _node, ...props }) => (
    <ul className={cn("my-6 ml-6 list-disc text-lg leading-8 text-foreground [&>li]:mt-2", className)} {...props} />
  ),
  ol: ({ className, node: _node, ...props }) => (
    <ol className={cn("my-6 ml-6 list-decimal text-lg leading-8 text-foreground [&>li]:mt-2", className)} {...props} />
  ),
  a: ({ href, className, children, node: _node }) => {
    const target = href ?? "#";
    const isInternal = target.startsWith("/") || target.startsWith("#");
    const classes = cn("font-medium text-primary underline underline-offset-4 hover:text-primary/80", className);
    if (isInternal) {
      return (
        <Link href={target} className={classes}>
          {children}
        </Link>
      );
    }
    return (
      <a href={target} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  },
  code: ({ className, node: _node, ...props }) => (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.4rem] py-[0.2rem] font-mono text-[0.9em] text-foreground",
        className,
      )}
      {...props}
    />
  ),
  pre: ({ className, node: _node, ...props }) => (
    <pre
      className={cn(
        "my-6 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-[0.9375rem] [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[0.9375rem]",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, node: _node, ...props }) => (
    <blockquote
      className={cn("mt-5 border-l-2 border-border pl-4 italic text-muted-foreground", className)}
      {...props}
    />
  ),
  table: ({ className, node: _node, ...props }) => (
    <div className="my-6 w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-base", className)} {...props} />
    </div>
  ),
  th: ({ className, node: _node, ...props }) => (
    <th
      className={cn("border border-border px-3 py-2 text-left font-semibold text-foreground", className)}
      {...props}
    />
  ),
  td: ({ className, node: _node, ...props }) => (
    <td className={cn("border border-border px-3 py-2 text-foreground", className)} {...props} />
  ),
  hr: ({ className, node: _node, ...props }) => (
    <hr className={cn("my-8 border-border", className)} {...props} />
  ),
  img: ({ className, alt, node: _node, ...props }) => (
    <img alt={alt ?? ""} className={cn("my-5 rounded-lg border border-border", className)} {...props} />
  ),
};
