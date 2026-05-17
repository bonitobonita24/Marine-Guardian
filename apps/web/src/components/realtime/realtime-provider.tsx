"use client";

import { useNotificationStream } from "@/hooks/useNotificationStream";

/**
 * Single mount point for `useNotificationStream` so the SSE connection (and
 * REST poller fallback) opens exactly once for the lifetime of the dashboard
 * tree, regardless of route. Place this inside `SessionProvider` so the hook
 * can rely on the next-auth context if it ever needs to.
 */
export function RealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useNotificationStream();
  return <>{children}</>;
}
