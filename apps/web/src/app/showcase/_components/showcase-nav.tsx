"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SHOWCASE_HOME, landingHref } from "./showcase-base";

// Absolute (not bare "#id") so these resolve correctly from BOTH the landing
// and its subpages — a bare hash on /showcase/timeline would target an anchor
// that only exists on the landing page. landingHref() points them at the
// landing wherever it lives ("/" on public domains, "/showcase" in dev).
const LINKS = [
  { href: landingHref("#features"), label: "Features" },
  { href: landingHref("#how"), label: "How it works" },
  { href: landingHref("#roles"), label: "Roles" },
];

export function ShowcaseNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href={SHOWCASE_HOME} className="flex items-center">          <img
            src="/marine-guardian-logo.png"
            alt="Marine Guardian"
            className="h-8 w-auto"
          />
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

        <div className="flex items-center gap-2">
          {/* Jump straight into the live Philippines tenant. Unauthenticated
              visitors land on /ph/login; the tenant [tenant] segment resolves
              "ph" server-side (see app/[tenant]/page.tsx). */}
          <Button asChild size="sm" variant="outline">
            <Link href="/ph">Go to PH</Link>
          </Button>
          <Button asChild size="sm">
            <a href={landingHref("#contact")}>Request a demo</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
