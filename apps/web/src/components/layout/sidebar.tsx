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
  CircleUserRound,
  type LucideIcon,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { APP_VERSION } from "@/lib/version";
import { useNotificationStore } from "@/lib/realtime/notification-store";
import { useTenantSlug } from "@/lib/routing/use-tenant-slug";
import { tenantHref } from "@/lib/routing/tenant-href";

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
  // ACCOUNT (2026-07-06): self-service Profile — own password + own email.
  // Visible to EVERY authenticated role (including viewer + administrator,
  // both of which lose other menus above) — see the allow-list / deny-list
  // handling below, neither of which hides "/profile".
  {
    label: "ACCOUNT",
    items: [
      { href: "/profile", icon: CircleUserRound, labelKey: "profile" },
    ],
  },
];

// viewer role (2026-07-05, extended 2026-07-06): read-only, scoped to
// Command Center (/dashboard) + Interactive Report Map (/map) + Exports
// (/exports — viewer can now generate a printable report from /map and
// must be able to reach /exports to retrieve it, reportGenerateProcedure)
// + Profile (/profile — every role, including viewer, can manage its own
// password/email). Every other page is hidden from nav here AND blocked at
// the route level in middleware.ts (defense in depth — a viewer can never
// reach a hidden page even via a typed URL or bookmark).
const VIEWER_ALLOWED_HREFS = new Set<string>([
  "/dashboard",
  "/map",
  "/exports",
  "/profile",
]);

// Users (user management) + Settings (tenant configuration) are visible to
// tenant_manager (platform) AND tenant_superadmin (the tenant's own owner) —
// the exact allow-list `userManagementProcedure` grants and middleware.ts
// enforces at the route level. WIDENED 2026-07-10: tenant_superadmin can now
// manage its own tenant's users/settings without a platform tenant_manager.
// Every other authenticated role (tenant_admin, field_coordinator, operator,
// viewer) still hits FORBIDDEN there, so the nav items are hidden to match —
// no role should see a menu it cannot use. "/profile" is deliberately NOT in
// this set, so every role keeps its own self-service Profile page. viewer is
// handled by its own allow-list above. Route enforcement (typed/bookmarked
// /users or /settings URL) lives in middleware.ts + the tRPC layer.
const TENANT_ADMIN_AREA_HREFS = new Set<string>(["/users", "/settings"]);

function getVisibleNavGroups(roles: readonly string[]) {
  if (roles.includes("viewer")) {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => VIEWER_ALLOWED_HREFS.has(item.href)),
      }))
      .filter((group) => group.items.length > 0);
  }
  const isTenantAdminAreaUser =
    roles.includes("tenant_manager") || roles.includes("tenant_superadmin");
  if (!isTenantAdminAreaUser) {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !TENANT_ADMIN_AREA_HREFS.has(item.href),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }
  return navGroups;
}

// The active-state + allow-list checks compare against BARE routes ("/map"),
// but usePathname() now returns "/[tenant]/map". Strip the leading tenant slug.
function stripTenant(pathname: string): string {
  return `/${pathname.split("/").filter(Boolean).slice(1).join("/")}`;
}

export function Sidebar() {
  const pathname = usePathname();
  const tenant = useTenantSlug();
  const basePath = stripTenant(pathname);
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
                  basePath === item.href ||
                  basePath.startsWith(`${item.href}/`);
                const showUnread =
                  item.href === "/notifications" && unread > 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={tenantHref(tenant, item.href)}
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
          onClick={() => void signOut({ callbackUrl: tenantHref(tenant, "/login") })}
        >
          <LogOut className="h-3 w-3" />
          {tAuth("signOut")}
        </Button>
        {/* White-label signature (design-defaults Entry 3): app version + Powerbyte credit */}
        <div className="px-2 pt-1 text-[9px] leading-tight text-muted-foreground/70">
          <p>v{APP_VERSION}</p>
          <a
            href="https://www.powerbyteitsolutions.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground hover:underline"
          >
            Developed by Powerbyte IT Solutions
          </a>
        </div>
      </div>
    </aside>
  );
}
