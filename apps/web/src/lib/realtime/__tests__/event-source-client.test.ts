// @vitest-environment jsdom
//
// event-source-client.test.ts
//
// Unit tests for the browser EventSource wrapper used by useNotificationStream
// to consume the SSE stream at /api/stream/notifications served by SSE-1.
//
// The wrapper exists so the hook layer can stay agnostic of EventSource
// quirks (event-name-keyed listeners, no header support, single-use object)
// and so we can inject a fake constructor in tests via the factory parameter
// — mirroring the RedisFactory DI pattern used in realtime-subscriber.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createNotificationEventSource,
  type EventSourceFactory,
  type NotificationStreamEvent,
} from "../event-source-client";

// Minimal stand-in for the browser EventSource interface. We only model the
// fields our wrapper actually touches: addEventListener, onerror, close,
// readyState — plus a test-only __emit hook so specs can drive the mock.
interface MockEventSource {
  url: string;
  readyState: number;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  onerror: ((event: Event) => void) | null;
  __emit: (eventName: string, data: string, id?: string) => void;
  __emitError: () => void;
}

function makeMockEventSource(url: string): MockEventSource {
  const listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  const mock: MockEventSource = {
    url,
    readyState: 1, // OPEN
    close: vi.fn(() => {
      mock.readyState = 2; // CLOSED
    }),
    addEventListener: vi.fn((name: string, handler: (e: MessageEvent) => void) => {
      (listeners[name] ??= []).push(handler);
    }),
    onerror: null,
    __emit: (eventName: string, data: string, id?: string) => {
      const event = new MessageEvent(eventName, { data, lastEventId: id ?? "" });
      for (const h of listeners[eventName] ?? []) h(event);
    },
    __emitError: () => {
      if (mock.onerror) mock.onerror(new Event("error"));
    },
  };
  return mock;
}

describe("createNotificationEventSource", () => {
  let mockSource: MockEventSource;
  let factory: ReturnType<typeof vi.fn>;
  // Cast at the call site so vi.fn() identity is preserved for spy assertions.
  const asFactory = (): EventSourceFactory => factory as unknown as EventSourceFactory;

  beforeEach(() => {
    factory = vi.fn((url: string) => {
      mockSource = makeMockEventSource(url);
      return mockSource as unknown as EventSource;
    });
  });

  it("constructs an EventSource at the given URL and subscribes to notification.created", () => {
    const onMessage = vi.fn();
    const onError = vi.fn();

    createNotificationEventSource(
      { url: "/api/stream/notifications", onMessage, onError },
      asFactory(),
    );

    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith("/api/stream/notifications");
    expect(mockSource.addEventListener).toHaveBeenCalledWith(
      "notification.created",
      expect.any(Function),
    );
  });

  it("invokes onMessage with the parsed JSON payload + id when an event arrives", () => {
    const onMessage = vi.fn();

    createNotificationEventSource(
      {
        url: "/api/stream/notifications",
        onMessage,
        onError: vi.fn(),
      },
      asFactory(),
    );

    const payload = { notificationId: "n1", message: "Hello" };
    mockSource.__emit("notification.created", JSON.stringify(payload), "evt-7");

    expect(onMessage).toHaveBeenCalledOnce();
    const received = onMessage.mock.calls[0]?.[0] as NotificationStreamEvent;
    expect(received.id).toBe("evt-7");
    expect(received.type).toBe("notification.created");
    expect(received.data).toEqual(payload);
  });

  it("appends ?lastEventId=... to the URL when reconnecting with a known id", () => {
    createNotificationEventSource(
      {
        url: "/api/stream/notifications",
        onMessage: vi.fn(),
        onError: vi.fn(),
        lastEventId: "evt-42",
      },
      asFactory(),
    );

    expect(factory).toHaveBeenCalledOnce();
    const calledUrl = factory.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("/api/stream/notifications");
    expect(calledUrl).toContain("lastEventId=evt-42");
  });

  it("invokes onError when the EventSource emits an error event", () => {
    const onError = vi.fn();

    createNotificationEventSource(
      { url: "/api/stream/notifications", onMessage: vi.fn(), onError },
      asFactory(),
    );

    mockSource.__emitError();

    expect(onError).toHaveBeenCalledOnce();
  });

  it("close() releases the underlying EventSource", () => {
    const client = createNotificationEventSource(
      { url: "/api/stream/notifications", onMessage: vi.fn(), onError: vi.fn() },
      asFactory(),
    );

    client.close();

    expect(mockSource.close).toHaveBeenCalledOnce();
  });
});
