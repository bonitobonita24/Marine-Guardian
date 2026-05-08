"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Map,
  CalendarClock,
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
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/map", icon: Map, labelKey: "map" },
  { href: "/events", icon: CalendarClock, labelKey: "events" },
  { href: "/patrols", icon: Ship, labelKey: "patrols" },
  { href: "/subjects", icon: Users, labelKey: "subjects" },
  { href: "/patrol-areas", icon: MapPin, labelKey: "patrolAreas" },
  { href: "/observations", icon: Eye, labelKey: "observations" },
  { href: "/alerts", icon: Bell, labelKey: "alerts" },
  { href: "/notifications", icon: BellRing, labelKey: "notifications" },
  { href: "/sync", icon: RefreshCw, labelKey: "sync" },
  { href: "/users", icon: UserCog, labelKey: "users" },
  { href: "/settings", icon: Settings, labelKey: "settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const unreadCountQuery = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const unread = unreadCountQuery.data ?? 0;

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-semibold">Marine Guardian</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showUnread = item.href === "/notifications" && unread > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {showUnread ? (
                    <span
                      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
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
      </nav>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          {tAuth("signOut")}
        </Button>
      </div>
    </aside>
  );
}
