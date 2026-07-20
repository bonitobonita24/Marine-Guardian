"use client";

import Link from "next/link";
import { Waves } from "lucide-react";

import { Button } from "@/components/ui/button";

// Absolute (not bare "#id") so these resolve correctly from BOTH /showcase and
// its subpages — a bare hash on /showcase/timeline would target an anchor that
// only exists on the landing page.
const LINKS = [
  { href: "/showcase#features", label: "Features" },
  { href: "/showcase#how", label: "How it works" },
  { href: "/showcase#roles", label: "Roles" },
];

export function ShowcaseNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/showcase" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]">
            <Waves className="h-4 w-4" />
          </span>
          <span className="text-sm text-foreground">Marine Guardian</span>
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/showcase/timeline"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Timeline
          </Link>
          <Link
            href="/docs"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Documentation
          </Link>
        </nav>

        <Button asChild size="sm">
          <a href="/showcase#contact">Request a demo</a>
        </Button>
      </div>
    </header>
  );
}
