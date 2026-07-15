import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getDocsTree } from "@/lib/docs/source";

import { DocsSidebar } from "./_components/docs-sidebar";

// The docs tree + page bodies now come from Postgres (CMS_BUILD_PLAN.md W4),
// which is unreachable at Docker build time (no DATABASE_URL during `next
// build`'s static-export pass) and can change at runtime via the CMS editor
// — so the whole /docs subtree renders per-request rather than being
// statically prerendered.
export const dynamic = "force-dynamic";

// Public docs shell (peer of /showcase, NOT under [tenant]). Renders the
// shadcn Sidebar app-shell: a persistent left tree (off-canvas sheet on mobile
// via the sidebar block) + an inset content area with a header holding the
// SidebarTrigger. Dark theme + design tokens inherited from the root layout's
// ThemeProvider (defaultTheme="dark"). Reading content lives in a centered
// max-w-3xl column (design-defaults Entry 1).

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const tree = await getDocsTree();

  return (
    <SidebarProvider>
      <DocsSidebar tree={tree} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <span className="text-sm font-medium text-foreground">Marine Guardian Documentation</span>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
