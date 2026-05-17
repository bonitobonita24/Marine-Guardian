// useNotificationStream.ts
//
// Top-level React hook that subscribes the browser to per-user notification
// events served by the SSE Route Handler at /api/stream/notifications, with
// an automatic REST polling fallback after maxReconnectAttempts consecutive
// EventSource errors.
//
// Responsibilities:
//   1. Open a NotificationEventSource on mount, forward events into the
//      Zustand store, persist the latest event id to localStorage.
//   2. On error, schedule reconnect with exponential backoff
//      (1s, 2s, 4s, 8s, 16s, …) capped at maxReconnectAttempts.
//   3. After maxReconnectAttempts hit, swap to NotificationPoller against
//      the REST fallback endpoint at /api/notifications/recent.
//   4. Tear down both EventSource and poller on unmount.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  createNotificationEventSource,
  type EventSourceClient,
  type NotificationStreamEvent,
} from "@/lib/realtime/event-source-client";
import {
  createNotificationPoller,
  type NotificationPoller,
} from "@/lib/realtime/notification-poller";
import {
  useNotificationStore,
  type Notification,
} from "@/lib/realtime/notification-store";

export type StreamStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "polling"
  | "disconnected";

export type UseNotificationStreamOptions = {
  /** When false, the hook is a no-op. Default: true. */
  enabled?: boolean;
  /** Default: "/api/stream/notifications". */
  streamUrl?: string;
  /** Default: "/api/notifications/recent". */
  pollUrl?: string;
  /** Default: 30_000 (30s). */
  pollIntervalMs?: number;
  /** Default: 5. After this many failed reconnects, switch to polling. */
  maxReconnectAttempts?: number;
};

export type UseNotificationStreamResult = {
  status: StreamStatus;
  reconnectAttempts: number;
};

const LOCAL_STORAGE_KEY = "marine-guardian:notifications:lastEventId";
const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
const FINAL_BACKOFF_MS = 16000;

function readStoredEventId(): string | undefined {
  try {
    const value = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStoredEventId(id: string): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, id);
  } catch {
    // localStorage may be disabled (private mode, quota) — degrade gracefully.
  }
}

function toNotification(event: NotificationStreamEvent): Notification {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id : event.id;
  const message =
    typeof data.message === "string"
      ? data.message
      : typeof data.title === "string"
        ? data.title
        : "";
  const createdAt =
    typeof data.createdAt === "string"
      ? data.createdAt
      : new Date().toISOString();
  return { id, message, createdAt, read: false };
}

export function useNotificationStream(
  options?: UseNotificationStreamOptions,
): UseNotificationStreamResult {
  const enabled = options?.enabled ?? true;
  const streamUrl = options?.streamUrl ?? "/api/stream/notifications";
  const pollUrl = options?.pollUrl ?? "/api/notifications/recent";
  const pollIntervalMs = options?.pollIntervalMs ?? 30_000;
  const maxReconnectAttempts = options?.maxReconnectAttempts ?? 5;

  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Refs survive across re-renders; the orchestration logic lives in a
  // single useEffect that re-runs only when option identities change.
  const clientRef = useRef<EventSourceClient | null>(null);
  const pollerRef = useRef<NotificationPoller | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastEventIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    lastEventIdRef.current = readStoredEventId();
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    setStatus("connecting");

    const addNotification = useNotificationStore.getState().addNotification;

    const startPoller = (): void => {
      // Abandon any open EventSource — we are committing to polling.
      clientRef.current?.close();
      clientRef.current = null;
      if (pollerRef.current) return; // already polling

      setStatus("polling");
      const poller = createNotificationPoller({
        url: pollUrl,
        intervalMs: pollIntervalMs,
        onMessage: (events) => {
          for (const event of events) {
            lastEventIdRef.current = event.id;
            writeStoredEventId(event.id);
            addNotification(toNotification(event));
          }
        },
        ...(lastEventIdRef.current !== undefined && {
          initialCursor: lastEventIdRef.current,
        }),
      });
      pollerRef.current = poller;
      poller.start();
    };

    const openConnection = (): void => {
      const client = createNotificationEventSource({
        url: streamUrl,
        ...(lastEventIdRef.current !== undefined && {
          lastEventId: lastEventIdRef.current,
        }),
        onMessage: (event) => {
          reconnectAttemptsRef.current = 0;
          setReconnectAttempts(0);
          setStatus("connected");
          lastEventIdRef.current = event.id;
          writeStoredEventId(event.id);
          addNotification(toNotification(event));
        },
        onError: () => {
          if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            startPoller();
            return;
          }
          reconnectAttemptsRef.current += 1;
          const attempt = reconnectAttemptsRef.current;
          setReconnectAttempts(attempt);
          setStatus("reconnecting");
          const delay =
            BACKOFF_DELAYS_MS[
              Math.min(attempt - 1, BACKOFF_DELAYS_MS.length - 1)
            ] ?? FINAL_BACKOFF_MS;
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            clientRef.current?.close();
            openConnection();
          }, delay);
        },
      });
      clientRef.current = client;
    };

    openConnection();

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      clientRef.current?.close();
      clientRef.current = null;
      pollerRef.current?.stop();
      pollerRef.current = null;
    };
  }, [enabled, streamUrl, pollUrl, pollIntervalMs, maxReconnectAttempts]);

  return { status, reconnectAttempts };
}
