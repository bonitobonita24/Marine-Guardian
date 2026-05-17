// notification-store.test.ts
//
// Unit tests for the Zustand store that the SSE pipeline writes into and
// the notification UI reads from. The store is intentionally small: it
// holds the in-memory list of notifications received this session plus a
// derived unreadCount, and exposes mutators the hook calls when events
// arrive (addNotification) and the bell UI calls on user action
// (markAsRead, markAllAsRead, clear).
//
// Persistence is intentionally NOT in scope here — the durable copy lives
// in Postgres via the existing notification router; this store is the
// realtime ephemera that drives the bell badge between hard refreshes.

import { describe, it, expect, beforeEach } from "vitest";
import {
  useNotificationStore,
  type Notification,
} from "../notification-store";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    message: "Alert triggered",
    createdAt: "2026-05-16T18:00:00.000Z",
    read: false,
    ...overrides,
  };
}

describe("useNotificationStore", () => {
  beforeEach(() => {
    // Reset the singleton store between tests so we don't leak state across
    // describe blocks. clear() is part of the public surface anyway.
    useNotificationStore.getState().clear();
  });

  it("addNotification prepends to the list and increments unreadCount", () => {
    const store = useNotificationStore.getState();

    store.addNotification(makeNotification({ id: "n1" }));
    store.addNotification(makeNotification({ id: "n2" }));

    const after = useNotificationStore.getState();
    // Newest first — matches typical notification bell ordering.
    expect(after.notifications.map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(after.unreadCount).toBe(2);
  });

  it("markAsRead flips the matching notification and decrements unreadCount", () => {
    const store = useNotificationStore.getState();
    store.addNotification(makeNotification({ id: "n1" }));
    store.addNotification(makeNotification({ id: "n2" }));

    store.markAsRead("n1");

    const after = useNotificationStore.getState();
    expect(after.notifications.find((n) => n.id === "n1")?.read).toBe(true);
    expect(after.notifications.find((n) => n.id === "n2")?.read).toBe(false);
    expect(after.unreadCount).toBe(1);
  });

  it("markAllAsRead flips every unread notification and zeroes unreadCount", () => {
    const store = useNotificationStore.getState();
    store.addNotification(makeNotification({ id: "n1" }));
    store.addNotification(makeNotification({ id: "n2" }));
    store.addNotification(makeNotification({ id: "n3", read: true }));

    store.markAllAsRead();

    const after = useNotificationStore.getState();
    expect(after.notifications.every((n) => n.read)).toBe(true);
    expect(after.unreadCount).toBe(0);
  });

  it("clear empties the list and resets unreadCount to 0", () => {
    const store = useNotificationStore.getState();
    store.addNotification(makeNotification({ id: "n1" }));
    store.addNotification(makeNotification({ id: "n2" }));

    store.clear();

    const after = useNotificationStore.getState();
    expect(after.notifications).toEqual([]);
    expect(after.unreadCount).toBe(0);
  });
});
