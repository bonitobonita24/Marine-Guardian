// event-source-client.ts
//
// Browser EventSource wrapper for the SSE-2 client pipeline.
//
// The factory parameter follows the RedisFactory DI pattern from
// realtime-subscriber.ts so tests can swap in a fake EventSource constructor
// without monkey-patching the global.

export type NotificationStreamEvent = {
  /** The SSE `id:` field — used as the lastEventId cursor on reconnect. */
  id: string;
  /** Currently always `notification.created`; declared as a string union to
   * leave room for future event types like `alert.resolved`. */
  type: "notification.created";
  /** JSON-parsed `data:` field — the publisher schema is owned by
   * @marine-guardian/jobs (alerts processor). */
  data: unknown;
};

export type EventSourceClient = {
  /** Tear down the underlying EventSource and release the connection. Safe
   * to call multiple times. */
  close: () => void;
};

export type CreateEventSourceOptions = {
  url: string;
  onMessage: (event: NotificationStreamEvent) => void;
  onError: (error: Event) => void;
  /** If present, appended to the URL as `?lastEventId=<id>` so the SSE
   * Route Handler can replay events the client missed during a disconnect. */
  lastEventId?: string;
};

/** Constructor injection seam — defaults to `new EventSource(url)`. */
export type EventSourceFactory = (url: string) => EventSource;

const defaultFactory: EventSourceFactory = (url) => new EventSource(url);

function buildUrl(baseUrl: string, lastEventId?: string): string {
  if (lastEventId === undefined || lastEventId.length === 0) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}lastEventId=${encodeURIComponent(lastEventId)}`;
}

export function createNotificationEventSource(
  options: CreateEventSourceOptions,
  factory: EventSourceFactory = defaultFactory,
): EventSourceClient {
  const url = buildUrl(options.url, options.lastEventId);
  const source = factory(url);

  source.addEventListener("notification.created", (rawEvent: Event) => {
    const event = rawEvent as MessageEvent<string>;
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      // Malformed payload — swallow rather than crash the EventSource pipeline.
      // Server-side validation owns the schema; client should not blow up on it.
      return;
    }
    options.onMessage({
      id: event.lastEventId,
      type: "notification.created",
      data: parsed,
    });
  });

  source.onerror = (errorEvent: Event) => {
    options.onError(errorEvent);
  };

  let closed = false;
  return {
    close: () => {
      if (closed) return;
      closed = true;
      source.close();
    },
  };
}
