"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { buildExportUrl } from "@/lib/exports";
import { useNotificationStore } from "@/lib/realtime/notification-store";

type NotificationType = "critical" | "warning" | "info" | "system";
type TypeFilter = NotificationType | "all";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "system", label: "System" },
];

const TYPE_STYLES: Record<NotificationType, { dot: string; badge: string; label: string }> = {
  critical: {
    dot: "bg-red-500",
    badge: "border-red-500/50 text-red-700 dark:text-red-400",
    label: "Critical",
  },
  warning: {
    dot: "bg-orange-500",
    badge: "border-orange-500/50 text-orange-700 dark:text-orange-400",
    label: "Warning",
  },
  info: {
    dot: "bg-blue-500",
    badge: "border-blue-500/50 text-blue-700 dark:text-blue-400",
    label: "Info",
  },
  system: {
    dot: "bg-gray-400",
    badge: "border-gray-400/50 text-gray-700 dark:text-gray-400",
    label: "System",
  },
};

function formatTimestamp(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const utils = trpc.useUtils();

  // Realtime: when a new notification arrives via SSE (or the REST poller
  // fallback), `useNotificationStream` prepends it to the in-memory store.
  // We watch the store length and invalidate the DB-backed queries so the
  // page re-fetches from Postgres — the store itself is ephemera; Postgres
  // remains the source of truth for the rendered list and unread count.
  const notificationsLength = useNotificationStore(
    (s) => s.notifications.length,
  );
  useEffect(() => {
    void utils.notification.list.invalidate();
    void utils.notification.unreadCount.invalidate();
  }, [notificationsLength, utils]);

  const listQuery = trpc.notification.list.useQuery({
    limit: 100,
    notificationType: typeFilter === "all" ? undefined : typeFilter,
  });
  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      void utils.notification.list.invalidate();
      void utils.notification.unreadCount.invalidate();
    },
  });
  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notification.list.invalidate();
      void utils.notification.unreadCount.invalidate();
    },
  });

  const items = listQuery.data?.items ?? [];
  const unreadInView = items.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Alerts and system notifications, newest first.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <a
              href={buildExportUrl(
                "notifications",
                { notificationType: typeFilter === "all" ? undefined : typeFilter },
                "csv",
              )}
              download
            >
              Export CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={buildExportUrl(
                "notifications",
                { notificationType: typeFilter === "all" ? undefined : typeFilter },
                "pdf",
              )}
              download
            >
              Export PDF
            </a>
          </Button>
          <Select
            value={typeFilter}
            onValueChange={(v) => { setTypeFilter(v as TypeFilter); }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { markAllReadMutation.mutate(); }}
            disabled={markAllReadMutation.isPending || unreadInView === 0}
          >
            {markAllReadMutation.isPending ? "Marking..." : "Mark all as read"}
          </Button>
        </div>
      </div>

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notifications...</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No notifications{typeFilter === "all" ? "" : ` of type "${typeFilter}"`} yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const styles = TYPE_STYLES[n.notificationType];
            const patrolId = n.patrolId ?? null;
            const eventId = n.eventId ?? null;
            const href =
              patrolId !== null
                ? `/patrols/${patrolId}`
                : eventId !== null
                  ? `/events/${eventId}`
                  : null;
            const handleMarkRead = () => {
              if (n.isRead) return;
              markReadMutation.mutate({ id: n.id });
            };

            const body = (
              <Card
                className={
                  n.isRead
                    ? "transition-colors"
                    : "border-l-4 border-l-primary bg-muted/30 transition-colors"
                }
              >
                <CardContent className="flex items-start gap-3 py-4">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${styles.dot}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${styles.badge}`}>
                        {styles.label}
                      </Badge>
                      <h3
                        className={
                          n.isRead
                            ? "truncate text-sm text-foreground"
                            : "truncate text-sm font-semibold text-foreground"
                        }
                      >
                        {n.title}
                      </h3>
                      {n.isRead ? null : (
                        <span className="text-[10px] uppercase tracking-wide text-primary">
                          New
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatTimestamp(n.createdAt)}</span>
                      {n.patrol !== null ? (
                        <span className="truncate">
                          → Patrol: {n.patrol.title ?? n.patrol.serialNumber ?? n.patrol.id}
                        </span>
                      ) : n.event !== null ? (
                        <span className="truncate">
                          → {n.event.title}{" "}
                          <span className="text-[10px] uppercase tracking-wide">
                            ({n.event.state})
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {n.isRead ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleMarkRead();
                      }}
                      disabled={markReadMutation.isPending}
                    >
                      Mark read
                    </Button>
                  )}
                </CardContent>
              </Card>
            );

            return (
              <li key={n.id}>
                {href !== null ? (
                  <Link
                    href={href}
                    onClick={handleMarkRead}
                    className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
