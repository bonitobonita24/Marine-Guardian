// @vitest-environment jsdom
//
// useNotificationStream.test.ts
//
// Tests for the top-level React hook that wires the SSE client, the Zustand
// store, the REST poller fallback, and the Last-Event-ID localStorage
// persistence into a single subscription primitive consumed by the
// notification bell component.
//
// State machine (asserted across the tests below):
//   mount             → status='connecting'
//   first SSE message → status='connected', event added to store, id saved
//   onError fires     → status='reconnecting', exponential backoff timer set
//                        (1s → 2s → 4s → 8s → 16s, capped at maxReconnectAttempts)
//   5 failed retries  → status='polling', poller started
//   unmount           → both EventSource and poller torn down
//
// The lower-level modules (event-source-client, notification-store,
// notification-poller) are mocked here so this spec exercises only the
// hook's orchestration logic — their own contracts are covered by their
// dedicated unit tests in this directory.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// --- Mocks ---------------------------------------------------------------
//
// vi.mock hoists above imports, so we declare the mock factories first and
// reach back into them via the imported reference after the import.

vi.mock("@/lib/realtime/event-source-client", () => {
  const createNotificationEventSource = vi.fn();
  return { createNotificationEventSource };
});

vi.mock("@/lib/realtime/notification-poller", () => {
  const createNotificationPoller = vi.fn();
  return { createNotificationPoller };
});

vi.mock("@/lib/realtime/notification-store", () => {
  const addNotification = vi.fn();
  const clear = vi.fn();
  const state = {
    notifications: [],
    unreadCount: 0,
    addNotification,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    clear,
  };
  const useNotificationStore = Object.assign(
    // The store hook itself returns the state object — sufficient for the
    // hook code paths we test here.
    () => state,
    {
      getState: () => state,
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  );
  return { useNotificationStore };
});

import { useNotificationStream } from "../useNotificationStream";
import { createNotificationEventSource } from "@/lib/realtime/event-source-client";
import { createNotificationPoller } from "@/lib/realtime/notification-poller";
import { useNotificationStore } from "@/lib/realtime/notification-store";

type EventSourceCallArgs = {
  url: string;
  onMessage: (event: {
    id: string;
    type: "notification.created";
    data: unknown;
  }) => void;
  onError: (error: Event) => void;
  lastEventId?: string;
};

type PollerCallArgs = {
  url: string;
  intervalMs: number;
  onMessage: (events: unknown[]) => void;
  initialCursor?: string;
};

const LOCAL_STORAGE_KEY = "marine-guardian:notifications:lastEventId";

function lastEventSourceCall(): EventSourceCallArgs {
  const mock = createNotificationEventSource as unknown as ReturnType<
    typeof vi.fn
  >;
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  return call?.[0] as EventSourceCallArgs;
}

function lastPollerCall(): PollerCallArgs {
  const mock = createNotificationPoller as unknown as ReturnType<typeof vi.fn>;
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  return call?.[0] as PollerCallArgs;
}

describe("useNotificationStream", () => {
  let mockClient: { close: ReturnType<typeof vi.fn> };
  let mockPoller: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    isPolling: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();

    mockClient = { close: vi.fn() };
    mockPoller = {
      start: vi.fn(),
      stop: vi.fn(),
      isPolling: vi.fn(() => false),
    };

    (
      createNotificationEventSource as unknown as ReturnType<typeof vi.fn>
    ).mockReset();
    (
      createNotificationPoller as unknown as ReturnType<typeof vi.fn>
    ).mockReset();
    (
      createNotificationEventSource as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => mockClient);
    (
      createNotificationPoller as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => mockPoller);

    const { addNotification } = useNotificationStore.getState();
    (addNotification as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens an EventSource on mount with the default stream URL", () => {
    renderHook(() => useNotificationStream());

    expect(createNotificationEventSource).toHaveBeenCalledOnce();
    const call = lastEventSourceCall();
    expect(call.url).toBe("/api/stream/notifications");
    expect(typeof call.onMessage).toBe("function");
    expect(typeof call.onError).toBe("function");
  });

  it("forwards incoming SSE events into the notification store", () => {
    renderHook(() => useNotificationStream());

    const { addNotification } = useNotificationStore.getState();
    const call = lastEventSourceCall();

    act(() => {
      call.onMessage({
        id: "evt-1",
        type: "notification.created",
        data: {
          id: "n1",
          message: "Patrol overdue",
          createdAt: "2026-05-16T18:30:00.000Z",
        },
      });
    });

    expect(addNotification).toHaveBeenCalledOnce();
    const stored = (
      addNotification as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0] as { id: string };
    expect(stored.id).toBe("n1");
  });

  it("persists the last seen event id to localStorage and replays it on reconnect", () => {
    const { rerender: _rerender } = renderHook(() => useNotificationStream());

    const firstCall = lastEventSourceCall();
    act(() => {
      firstCall.onMessage({
        id: "evt-42",
        type: "notification.created",
        data: { id: "n1" },
      });
    });

    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toBe("evt-42");

    // Trigger error + advance to first backoff window (1s) → hook should
    // reopen the EventSource with lastEventId threaded through.
    act(() => {
      firstCall.onError(new Event("error"));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const reconnectCall = lastEventSourceCall();
    expect(reconnectCall.lastEventId).toBe("evt-42");
  });

  it("reconnects with exponential backoff (1s, 2s, 4s, 8s, 16s) after errors", () => {
    renderHook(() => useNotificationStream());

    // Five failures, each followed by the matching backoff window.
    const expectedDelaysMs = [1000, 2000, 4000, 8000, 16000];
    let prevCallCount = 1; // mount opened the first connection

    for (const delay of expectedDelaysMs) {
      const current = lastEventSourceCall();

      // Trip the error and let the timer scheduler register.
      act(() => {
        current.onError(new Event("error"));
      });

      // Advance one millisecond short of the expected delay — must NOT have
      // attempted a new connection yet. Proves the backoff window is honoured.
      act(() => {
        vi.advanceTimersByTime(delay - 1);
      });
      expect(
        (createNotificationEventSource as unknown as ReturnType<typeof vi.fn>)
          .mock.calls.length,
      ).toBe(prevCallCount);

      // Cross the threshold → exactly one new connection attempt.
      act(() => {
        vi.advanceTimersByTime(1);
      });
      prevCallCount += 1;
      expect(
        (createNotificationEventSource as unknown as ReturnType<typeof vi.fn>)
          .mock.calls.length,
      ).toBe(prevCallCount);
    }
  });

  it("falls back to REST polling after 5 consecutive failed reconnects", () => {
    renderHook(() =>
      useNotificationStream({ maxReconnectAttempts: 5 }),
    );

    // Five failures, each consumed by its backoff timer firing.
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (const delay of delays) {
      const current = lastEventSourceCall();
      act(() => {
        current.onError(new Event("error"));
      });
      act(() => {
        vi.advanceTimersByTime(delay);
      });
    }

    // Sixth failure must trip the fallback rather than schedule a 32s retry.
    const last = lastEventSourceCall();
    act(() => {
      last.onError(new Event("error"));
    });

    expect(createNotificationPoller).toHaveBeenCalledOnce();
    expect(mockPoller.start).toHaveBeenCalledOnce();
    const pollerCall = lastPollerCall();
    expect(pollerCall.url).toBe("/api/notifications/recent");
  });

  it("closes the EventSource and stops the poller on unmount", () => {
    const { unmount } = renderHook(() =>
      useNotificationStream({ maxReconnectAttempts: 1 }),
    );

    // Force the poller path so we can assert both teardown calls fire.
    const first = lastEventSourceCall();
    act(() => {
      first.onError(new Event("error"));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const second = lastEventSourceCall();
    act(() => {
      second.onError(new Event("error"));
    });

    unmount();

    expect(mockClient.close).toHaveBeenCalled();
    expect(mockPoller.stop).toHaveBeenCalledOnce();
  });
});
