// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// Hoisted mutable stubs. `notificationsLength` drives the mocked
// notification-store selector. `useQueryOpts` captures whatever the sidebar
// passes as options to trpc.notification.unreadCount.useQuery so we can
// assert no `refetchInterval` is configured. `invalidateUnreadCount` is the
// spy attached to the mocked tRPC utils.
const { stubs } = vi.hoisted(() => {
  const stubs: {
    notificationsLength: number;
    useQueryOpts: unknown;
    useQueryCalled: boolean;
    invalidateUnreadCount: ReturnType<typeof vi.fn<() => Promise<void>>>;
    sessionRoles: string[];
  } = {
    notificationsLength: 0,
    useQueryOpts: undefined,
    useQueryCalled: false,
    invalidateUnreadCount: vi.fn<() => Promise<void>>(),
    sessionRoles: [],
  };
  return { stubs };
});

vi.mock("@/lib/realtime/notification-store", () => ({
  useNotificationStore: <T,>(
    selector: (s: { unreadCount: number; notifications: unknown[] }) => T,
  ): T =>
    selector({
      unreadCount: 5,
      notifications: Array.from(
        { length: stubs.notificationsLength },
        (_, i) => ({ id: String(i) }),
      ),
    }),
}));

// Stable utils object — real tRPC memoizes useUtils() so the effect should
// only re-fire when `notificationsLength` changes, not on every render.
const utilsObj = {
  notification: {
    unreadCount: {
      invalidate: stubs.invalidateUnreadCount,
    },
  },
};

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    notification: {
      unreadCount: {
        useQuery: (_input?: unknown, opts?: unknown) => {
          stubs.useQueryCalled = true;
          stubs.useQueryOpts = opts;
          return { data: 5 };
        },
      },
    },
    useUtils: () => utilsObj,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: { user: { roles: stubs.sessionRoles } },
  }),
}));

// Import AFTER mocks are registered.
import { Sidebar } from "../sidebar";

describe("Sidebar — SSE-driven invalidation", () => {
  beforeEach(() => {
    stubs.notificationsLength = 0;
    stubs.useQueryOpts = undefined;
    stubs.useQueryCalled = false;
    stubs.invalidateUnreadCount.mockReset();
    stubs.invalidateUnreadCount.mockResolvedValue(undefined);
    stubs.sessionRoles = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("does NOT configure unreadCount.useQuery with refetchInterval", () => {
    render(<Sidebar />);
    expect(stubs.useQueryCalled).toBe(true);
    if (stubs.useQueryOpts !== undefined && stubs.useQueryOpts !== null) {
      expect(stubs.useQueryOpts).not.toHaveProperty("refetchInterval");
    } else {
      expect(stubs.useQueryOpts).toBeUndefined();
    }
  });

  it("invalidates unreadCount once on mount", () => {
    render(<Sidebar />);
    expect(stubs.invalidateUnreadCount).toHaveBeenCalledTimes(1);
  });

  it("re-invalidates unreadCount when notification-store length changes", () => {
    const { rerender } = render(<Sidebar />);
    expect(stubs.invalidateUnreadCount).toHaveBeenCalledTimes(1);
    stubs.notificationsLength = 3;
    rerender(<Sidebar />);
    expect(stubs.invalidateUnreadCount).toHaveBeenCalledTimes(2);
  });

  it("renders the unread badge for the notifications nav item", () => {
    const { getByLabelText } = render(<Sidebar />);
    const badge = getByLabelText("5 unread notifications");
    expect(badge.textContent).toBe("5");
  });
});

// viewer role (2026-07-05) — nav visibility. A viewer sees ONLY "dashboard" +
// "map" (translated via the mocked useTranslations passthrough, so the
// labelKey itself is the rendered text). Every other role sees the full nav
// unchanged (no regression).
describe("Sidebar — viewer role nav filtering", () => {
  beforeEach(() => {
    stubs.notificationsLength = 0;
    stubs.useQueryOpts = undefined;
    stubs.useQueryCalled = false;
    stubs.invalidateUnreadCount.mockReset();
    stubs.invalidateUnreadCount.mockResolvedValue(undefined);
    stubs.sessionRoles = [];
  });

  afterEach(() => {
    cleanup();
  });

  // NOTE: "observations" was removed from the sidebar in T18 (2026-07-06 nav
  // reorg — PATROLS folded into OPERATIONS, Observations link dropped), so it
  // is intentionally absent from this "full nav" set.
  const ALL_NAV_LABEL_KEYS = [
    "dashboard",
    "map",
    "exports",
    "events",
    "notifications",
    "patrols",
    "patrolAreas",
    "patrolSchedule",
    "fuel",
    "alerts",
    "subjects",
    "sync",
    "users",
    "settings",
  ];

  it("renders exactly the 3 Command items for a viewer session (dashboard, map, exports)", () => {
    stubs.sessionRoles = ["viewer"];
    const { getByText, queryByText } = render(<Sidebar />);

    expect(getByText("dashboard")).toBeTruthy();
    expect(getByText("map")).toBeTruthy();
    // exports (2026-07-06): viewer can now generate + retrieve printable
    // reports, so /exports joins the viewer-allowed nav set.
    expect(getByText("exports")).toBeTruthy();

    for (const key of ALL_NAV_LABEL_KEYS) {
      if (key === "dashboard" || key === "map" || key === "exports") continue;
      expect(queryByText(key)).toBeNull();
    }
  });

  it.each(["super_admin", "site_admin", "field_coordinator", "operator"])(
    "renders the full nav unchanged for %s (no regression)",
    (role) => {
      stubs.sessionRoles = [role];
      const { getByText } = render(<Sidebar />);
      for (const key of ALL_NAV_LABEL_KEYS) {
        expect(getByText(key)).toBeTruthy();
      }
    },
  );

  it("renders the full nav when there is no session yet (unauthenticated render pass)", () => {
    stubs.sessionRoles = [];
    const { getByText } = render(<Sidebar />);
    for (const key of ALL_NAV_LABEL_KEYS) {
      expect(getByText(key)).toBeTruthy();
    }
  });
});

// Exports submenu item (2026-07-06) — rendered directly below "map" as a
// visually-nested child of "Interactive Report Map", linking to /exports.
describe("Sidebar — Exports submenu item", () => {
  beforeEach(() => {
    stubs.notificationsLength = 0;
    stubs.useQueryOpts = undefined;
    stubs.useQueryCalled = false;
    stubs.invalidateUnreadCount.mockReset();
    stubs.invalidateUnreadCount.mockResolvedValue(undefined);
    stubs.sessionRoles = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an Exports link to /exports, indented as a submenu under map", () => {
    const { getByText } = render(<Sidebar />);
    const exportsLabel = getByText("exports");
    const link = exportsLabel.closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/exports");
    // Indented sub-item styling distinguishes it from a peer nav item.
    expect(link?.className).toMatch(/ml-3/);
    expect(link?.className).toMatch(/border-l/);
  });

  it("shows Exports for a viewer session (2026-07-06: viewer can generate + retrieve reports)", () => {
    stubs.sessionRoles = ["viewer"];
    const { getByText } = render(<Sidebar />);
    expect(getByText("exports")).toBeTruthy();
  });
});
