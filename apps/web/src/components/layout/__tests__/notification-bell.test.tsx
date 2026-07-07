// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// Hoisted mutable stub the mocked store reads from. Tests mutate `stubs.unreadCount`
// in beforeEach to drive different render scenarios.
const { stubs } = vi.hoisted(() => ({ stubs: { unreadCount: 0 } }));

vi.mock("@/lib/realtime/notification-store", () => ({
  useNotificationStore: <T,>(
    selector: (s: { unreadCount: number; notifications: unknown[] }) => T,
  ): T => selector({ unreadCount: stubs.unreadCount, notifications: [] }),
}));

// Path-based tenancy: NotificationBell reads the tenant slug via useParams.
vi.mock("next/navigation", () => ({
  useParams: () => ({ tenant: "demo-site" }),
}));

// Import AFTER mocks are registered.
import { NotificationBell } from "../notification-bell";

describe("NotificationBell", () => {
  beforeEach(() => {
    stubs.unreadCount = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders no badge when unreadCount is 0", () => {
    const { queryByTestId } = render(<NotificationBell />);
    expect(queryByTestId("notification-bell-badge")).toBeNull();
  });

  it("renders the count when unreadCount is 3", () => {
    stubs.unreadCount = 3;
    const { getByTestId } = render(<NotificationBell />);
    const badge = getByTestId("notification-bell-badge");
    expect(badge.textContent).toBe("3");
  });

  it("caps display at 9+ when unreadCount exceeds 9", () => {
    stubs.unreadCount = 15;
    const { getByTestId } = render(<NotificationBell />);
    const badge = getByTestId("notification-bell-badge");
    expect(badge.textContent).toBe("9+");
  });

  it("uses an aria-label that announces the unread count", () => {
    stubs.unreadCount = 7;
    const { getByRole } = render(<NotificationBell />);
    const link = getByRole("link");
    expect(link.getAttribute("aria-label")).toBe("7 unread notifications");
  });

  it("links to /notifications", () => {
    stubs.unreadCount = 0;
    const { getByRole } = render(<NotificationBell />);
    const link = getByRole("link");
    expect(link.getAttribute("href")).toBe("/demo-site/notifications");
  });
});
