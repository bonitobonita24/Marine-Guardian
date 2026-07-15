import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

// Token-styled MDX element map. Everything inherits shadcn design tokens
// (text-foreground / text-muted-foreground / bg-muted / border-border / primary)
// — no hardcoded colors, no second CSS system. Docs images are same-origin
// absolute paths under /docs/** (public/docs/**), rendered as plain <img>
// (CSP img-src 'self' covers these).

export const docsMdxComponents: MDXComponents = {
  h1: ({ className, ...props }: ComponentPropsWithoutRef<"h1">) => (
    <h1
      className={cn("mt-2 scroll-m-20 text-3xl font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }: ComponentPropsWithoutRef<"h2">) => (
    <h2
      className={cn(
        "mt-10 scroll-m-20 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <h3 className={cn("mt-8 scroll-m-20 text-lg font-semibold tracking-tight text-foreground", className)} {...props} />
  ),
  p: ({ className, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p className={cn("leading-7 text-foreground [&:not(:first-child)]:mt-5", className)} {...props} />
  ),
  ul: ({ className, ...props }: ComponentPropsWithoutRef<"ul">) => (
    <ul className={cn("my-5 ml-6 list-disc text-foreground [&>li]:mt-2", className)} {...props} />
  ),
  ol: ({ className, ...props }: ComponentPropsWithoutRef<"ol">) => (
    <ol className={cn("my-5 ml-6 list-decimal text-foreground [&>li]:mt-2", className)} {...props} />
  ),
  a: ({ href, className, children }: ComponentPropsWithoutRef<"a">) => {
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
  code: ({ className, ...props }: ComponentPropsWithoutRef<"code">) => (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.4rem] py-[0.2rem] font-mono text-sm text-foreground",
        className,
      )}
      {...props}
    />
  ),
  pre: ({ className, ...props }: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className={cn(
        "my-5 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm [&>code]:bg-transparent [&>code]:p-0",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className={cn("mt-5 border-l-2 border-border pl-4 italic text-muted-foreground", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-5 w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }: ComponentPropsWithoutRef<"th">) => (
    <th
      className={cn("border border-border px-3 py-2 text-left font-semibold text-foreground", className)}
      {...props}
    />
  ),
  td: ({ className, ...props }: ComponentPropsWithoutRef<"td">) => (
    <td className={cn("border border-border px-3 py-2 text-foreground", className)} {...props} />
  ),
  hr: ({ className, ...props }: ComponentPropsWithoutRef<"hr">) => (
    <hr className={cn("my-8 border-border", className)} {...props} />
  ),
  img: ({ className, alt, ...props }: ComponentPropsWithoutRef<"img">) => (
    <img alt={alt ?? ""} className={cn("my-5 rounded-lg border border-border", className)} {...props} />
  ),
};
