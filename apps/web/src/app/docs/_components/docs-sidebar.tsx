"use client";

import { BookOpen, ChevronRight, Waves } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { APP_VERSION } from "@/lib/version";
import type { DocsTreeNode } from "@/lib/docs/source";

function isActive(pathname: string, url?: string): boolean {
  return url != null && pathname === url;
}

function containsActive(node: DocsTreeNode, pathname: string): boolean {
  if (isActive(pathname, node.url)) return true;
  return (node.children ?? []).some((c) => containsActive(c, pathname));
}

/**
 * Client docs sidebar — the tree is computed server-side and passed in.
 * Main sections with children render as a shadcn Collapsible that expands to
 * a SidebarMenuSub of sub-pages; leaf pages render as plain links. Active
 * state + default-open (for the branch containing the current page) derive
 * from usePathname.
 */
export function DocsSidebar({ tree }: { tree: DocsTreeNode[] }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/docs">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Waves className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Marine Guardian</span>
                  <span className="text-xs text-sidebar-foreground/70">Documentation</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {tree.map((node) => (
              <DocsNavNode key={node.slug.join("/")} node={node} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 pb-2 text-xs text-sidebar-foreground/70">
          <p>v{APP_VERSION}</p>
          <a
            href="https://www.powerbyteitsolutions.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-sidebar-foreground hover:underline"
          >
            Developed by Powerbyte IT Solutions
          </a>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function DocsNavNode({ node, pathname }: { node: DocsTreeNode; pathname: string }) {
  const hasChildren = (node.children?.length ?? 0) > 0;

  // Leaf page — a plain link.
  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive(pathname, node.url)}>
          {node.url != null ? (
            <Link href={node.url}>
              <BookOpen className="size-4" />
              <span>{node.title}</span>
            </Link>
          ) : (
            <span>{node.title}</span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Section with sub-pages — collapsible, open by default when it holds the
  // active page.
  const defaultOpen = containsActive(node, pathname);
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={isActive(pathname, node.url)}>
            <BookOpen className="size-4" />
            <span>{node.title}</span>
            <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {node.url != null ? (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={isActive(pathname, node.url)}>
                  <Link href={node.url}>Overview</Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ) : null}
            {(node.children ?? []).map((child) => (
              <SidebarMenuSubItem key={child.slug.join("/")}>
                <SidebarMenuSubButton asChild isActive={isActive(pathname, child.url)}>
                  {child.url != null ? (
                    <Link href={child.url}>{child.title}</Link>
                  ) : (
                    <span>{child.title}</span>
                  )}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
