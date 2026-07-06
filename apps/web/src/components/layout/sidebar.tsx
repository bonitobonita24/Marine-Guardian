"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Map,
  FileDown,
  CalendarClock,
  Calendar,
  Ship,
  Users,
  MapPin,
  Bell,
  BellRing,
  RefreshCw,
  UserCog,
  Settings,
  LogOut,
  Fuel,
  type LucideIcon,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { useNotificationStore } from "@/lib/realtime/notification-store";

interface NavItem {
  href: string;
  icon: LucideIcon;
  labelKey: string;
  // Renders the item indented, visually nested as a submenu under the
  // preceding sibling (e.g. "Exports" under "Interactive Report Map").
  indent?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Nav items grouped per mockup (mpa-command-center-v4.jsx navGroups):
// COMMAND | OPERATIONS | PATROLS | LOGISTICS | REPORTS | ADMIN
const navGroups: NavGroup[] = [
  {
    label: "COMMAND",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
      { href: "/map", icon: Map, labelKey: "map" },
      // Rendered indented as a submenu under "Interactive Report Map".
      { href: "/exports", icon: FileDown, labelKey: "exports", indent: true },
    ],
  },
  {
    // OPERATIONS now folds in the former PATROLS group (owner 2026-07-06):
    // Events · Patrols · Boundaries · Patrol Schedule · Notifications. The
    // Observations link is dropped from the nav (route/data remain).
    label: "OPERATIONS",
    items: [
      { href: "/events", icon: CalendarClock, labelKey: "events" },
      { href: "/patrols", icon: Ship, labelKey: "patrols" },
      { href: "/patrol-areas", icon: MapPin, labelKey: "patrolAreas" },
      { href: "/patrol-schedule", icon: Calendar, labelKey: "patrolSchedule" },
      { href: "/notifications", icon: BellRing, labelKey: "notifications" },
    ],
  },
  {
    label: "LOGISTICS",
    items: [
      { href: "/fuel", icon: Fuel, labelKey: "fuel" },
    ],
  },
  {
    label: "ADMIN",
    items: [
      { href: "/alerts", icon: Bell, labelKey: "alerts" },
      { href: "/subjects", icon: Users, labelKey: "subjects" },
      { href: "/sync", icon: RefreshCw, labelKey: "sync" },
      { href: "/users", icon: UserCog, labelKey: "users" },
      { href: "/settings", icon: Settings, labelKey: "settings" },
    ],
  },
];

// viewer role (2026-07-05): read-only, scoped to Command Center (/dashboard) +
// Interactive Report Map (/map) only. Every other page is hidden from nav here
// AND blocked at the route level in middleware.ts (defense in depth — a
// viewer can never reach a hidden page even via a typed URL or bookmark).
const VIEWER_ALLOWED_HREFS = new Set<string>(["/dashboard", "/map"]);

function getVisibleNavGroups(roles: readonly string[]) {
  if (!roles.includes("viewer")) {
    return navGroups;
  }
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => VIEWER_ALLOWED_HREFS.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const utils = trpc.useUtils();
  const unreadCountQuery = trpc.notification.unreadCount.useQuery();
  const unread = unreadCountQuery.data ?? 0;
  const { data: session } = useSession();
  const roles = session?.user.roles ?? [];
  const visibleNavGroups = getVisibleNavGroups(roles);

  // Realtime-driven invalidation: when `useNotificationStream` (mounted once
  // in RealtimeProvider) prepends a new notification to the in-memory store,
  // the store length changes and we invalidate the DB-backed unread count.
  // Replaces the previous 30s refetchInterval — Postgres remains the source
  // of truth, but the round-trip is now event-driven, not timer-driven.
  const notificationsLength = useNotificationStore(
    (s) => s.notifications.length,
  );
  useEffect(() => {
    void utils.notification.unreadCount.invalidate();
  }, [notificationsLength, utils]);

  return (
    <aside className="flex h-screen w-44 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-xs font-bold tracking-wide">Marine Guardian</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-1">
        {visibleNavGroups.map((group) => (
          <div key={group.label} className="mt-2 first:mt-1">
            {/* Group label — matches mockup: 7px, 700, muted, uppercase, letterSpacing */}
            <div className="px-3 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground/60">
              {group.label}
            </div>
            <ul>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const showUnread =
                  item.href === "/notifications" && unread > 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-sm mx-1 px-2 py-1 text-[11px] transition-colors",
                        item.indent === true
                          ? "ml-3 border-l pl-2 text-[10px]"
                          : undefined,
                        isActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-3 w-3 shrink-0" />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      {showUnread ? (
                        <span
                          className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground"
                          aria-label={`${String(unread)} unread notifications`}
                        >
                          {unread > 99 ? "99+" : String(unread)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start gap-2 px-2 text-[11px] text-muted-foreground"
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-3 w-3" />
          {tAuth("signOut")}
        </Button>
      </div>
    </aside>
  );
}
