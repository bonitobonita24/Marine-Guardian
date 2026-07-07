"use client";

import Link from "next/link";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "@/lib/realtime/notification-store";
import { useTenantSlug } from "@/lib/routing/use-tenant-slug";
import { tenantHref } from "@/lib/routing/tenant-href";

export function NotificationBell() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const display = unreadCount > 9 ? "9+" : String(unreadCount);
  const tenant = useTenantSlug();

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link
        href={tenantHref(tenant, "/notifications")}
        aria-label={`${String(unreadCount)} unread notifications`}
      >
        <BellRing aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            data-testid="notification-bell-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {display}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
