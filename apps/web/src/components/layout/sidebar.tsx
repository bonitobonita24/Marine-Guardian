"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Map,
  CalendarClock,
  Calendar,
  Ship,
  Users,
  MapPin,
  Eye,
  Bell,
  BellRing,
  RefreshCw,
  UserCog,
  Settings,
  LogOut,
  Fuel,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { useNotificationStore } from "@/lib/realtime/notification-store";

// Nav items grouped per mockup (mpa-command-center-v4.jsx navGroups):
// COMMAND | OPERATIONS | PATROLS | LOGISTICS | REPORTS | ADMIN
const navGroups = [
  {
    label: "COMMAND",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
      { href: "/map", icon: Map, labelKey: "map" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { href: "/events", icon: CalendarClock, labelKey: "events" },
      { href: "/observations", icon: Eye, labelKey: "observations" },
      { href: "/notifications", icon: BellRing, labelKey: "notifications" },
    ],
  },
  {
    label: "PATROLS",
    items: [
      { href: "/patrols", icon: Ship, labelKey: "patrols" },
      { href: "/patrol-areas", icon: MapPin, labelKey: "patrolAreas" },
      { href: "/patrol-schedule", icon: Calendar, labelKey: "patrolSchedule" },
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
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const utils = trpc.useUtils();
  const unreadCountQuery = trpc.notification.unreadCount.useQuery();
  const unread = unreadCountQuery.data ?? 0;

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
        {navGroups.map((group) => (
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
