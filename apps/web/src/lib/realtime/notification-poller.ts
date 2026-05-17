// notification-poller.ts
//
// REST polling fallback for environments where SSE fails to stay open
// (corporate proxies, aggressive load balancers, browsers that throttle
// long-lived connections in background tabs). useNotificationStream
// switches to this poller after maxReconnectAttempts consecutive EventSource
// errors.

import type { NotificationStreamEvent } from "./event-source-client";

export type { NotificationStreamEvent };

export type PollerOptions = {
  url: string;
  intervalMs: number;
  onMessage: (events: NotificationStreamEvent[]) => void;
  onError?: (error: Error) => void;
  /** Initial `?since=<id>` cursor. After the first response containing
   * events, the poller advances the cursor to the newest event id seen. */
  initialCursor?: string;
};

/** Fetch injection seam — defaults to `globalThis.fetch`. */
export type PollerFetch = (url: string) => Promise<Response>;

export type NotificationPoller = {
  start: () => void;
  stop: () => void;
  isPolling: () => boolean;
};

const defaultFetch: PollerFetch = (url) => globalThis.fetch(url);

function withCursor(baseUrl: string, cursor: string | undefined): string {
  if (cursor === undefined || cursor.length === 0) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}since=${encodeURIComponent(cursor)}`;
}

export function createNotificationPoller(
  options: PollerOptions,
  fetchImpl: PollerFetch = defaultFetch,
): NotificationPoller {
  let timerId: ReturnType<typeof setInterval> | null = null;
  let cursor: string | undefined = options.initialCursor;

  const tick = async (): Promise<void> => {
    const url = withCursor(options.url, cursor);
    try {
      const response = await fetchImpl(url);
      const body = (await response.json()) as {
        events?: NotificationStreamEvent[];
      };
      const events = body.events ?? [];
      if (events.length > 0) {
        // Server returns events in chronological order; the newest event id
        // becomes the next cursor.
        const newest = events[events.length - 1];
        if (newest) cursor = newest.id;
        options.onMessage(events);
      }
    } catch (rawError) {
      const error =
        rawError instanceof Error ? rawError : new Error(String(rawError));
      options.onError?.(error);
      // Intentionally do NOT stop the timer — transient network failures
      // should self-heal on the next tick.
    }
  };

  return {
    start: () => {
      if (timerId !== null) return;
      timerId = setInterval(() => {
        void tick();
      }, options.intervalMs);
    },
    stop: () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    },
    isPolling: () => timerId !== null,
  };
}
