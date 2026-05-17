// notification-poller.test.ts
//
// Unit tests for the REST polling fallback. The hook switches to the poller
// when the SSE EventSource fails to reconnect after maxReconnectAttempts
// — typical cause is a corporate proxy that buffers SSE indefinitely.
//
// The poller hits a JSON endpoint at intervalMs and forwards any new
// notifications via onMessage. It tracks a cursor (lastEventId) so the
// server can return only events newer than what the client already has.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createNotificationPoller,
  type PollerFetch,
  type NotificationStreamEvent,
} from "../notification-poller";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createNotificationPoller", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const asFetch = (): PollerFetch => fetchMock as unknown as PollerFetch;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ events: [] })));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll until start() is called", () => {
    createNotificationPoller(
      {
        url: "/api/notifications/recent",
        intervalMs: 1000,
        onMessage: vi.fn(),
      },
      asFetch(),
    );

    vi.advanceTimersByTime(5_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls at intervalMs after start() and forwards events via onMessage", async () => {
    const onMessage = vi.fn();
    const events: NotificationStreamEvent[] = [
      { id: "evt-1", type: "notification.created", data: { notificationId: "n1" } },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse({ events }));

    const poller = createNotificationPoller(
      {
        url: "/api/notifications/recent",
        intervalMs: 1000,
        onMessage,
      },
      asFetch(),
    );
    poller.start();

    // Advance one interval and let microtasks flush so the async fetch + onMessage
    // call resolve before we assert.
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(events);
  });

  it("threads the cursor as ?since=<id> on each request once an event has been seen", async () => {
    const onMessage = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          events: [{ id: "evt-9", type: "notification.created", data: {} }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ events: [] }));

    const poller = createNotificationPoller(
      {
        url: "/api/notifications/recent",
        intervalMs: 1000,
        onMessage,
        initialCursor: "evt-1",
      },
      asFetch(),
    );
    poller.start();

    // First tick uses the initialCursor.
    await vi.advanceTimersByTimeAsync(1000);
    const firstUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(firstUrl).toContain("since=evt-1");

    // Second tick must use the id of the most recent event returned by the
    // first response — proves the poller tracks its own cursor.
    await vi.advanceTimersByTimeAsync(1000);
    const secondUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondUrl).toContain("since=evt-9");
  });

  it("stop() halts further polls and isPolling() reflects state", async () => {
    const poller = createNotificationPoller(
      {
        url: "/api/notifications/recent",
        intervalMs: 1000,
        onMessage: vi.fn(),
      },
      asFetch(),
    );

    poller.start();
    expect(poller.isPolling()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    const callCountAfterFirstTick = fetchMock.mock.calls.length;

    poller.stop();
    expect(poller.isPolling()).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirstTick);
  });

  it("invokes onError when fetch rejects but keeps polling on subsequent ticks", async () => {
    const onError = vi.fn();
    const onMessage = vi.fn();
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({ events: [] }));

    const poller = createNotificationPoller(
      {
        url: "/api/notifications/recent",
        intervalMs: 1000,
        onMessage,
        onError,
      },
      asFetch(),
    );
    poller.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();
    const errArg = onError.mock.calls[0]?.[0] as unknown;
    expect(errArg).toBeInstanceOf(Error);

    // The transient error must not stop the timer.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
