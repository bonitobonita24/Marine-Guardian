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
    sessionCustomRoleId: string | null;
    sessionCustomRolePermissions: Record<
      string,
      { view: boolean; write: boolean; update: boolean; delete: boolean }
    > | null;
  } = {
    notificationsLength: 0,
    useQueryOpts: undefined,
    useQueryCalled: false,
    invalidateUnreadCount: vi.fn<() => Promise<void>>(),
    sessionRoles: [],
    sessionCustomRoleId: null,
    sessionCustomRolePermissions: null,
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
  usePathname: () => "/demo-site/dashboard",
  useParams: () => ({ tenant: "demo-site" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: {
      user: {
        roles: stubs.sessionRoles,
        customRoleId: stubs.sessionCustomRoleId,
        customRolePermissions: stubs.sessionCustomRolePermissions,
      },
    },
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
    stubs.sessionCustomRoleId = null;
    stubs.sessionCustomRolePermissions = null;
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
    stubs.sessionCustomRoleId = null;
    stubs.sessionCustomRolePermissions = null;
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
    "profile",
  ];

  it("renders exactly the 4 self-service items for a viewer session (dashboard, map, exports, profile)", () => {
    stubs.sessionRoles = ["viewer"];
    const { getByText, queryByText } = render(<Sidebar />);

    expect(getByText("dashboard")).toBeTruthy();
    expect(getByText("map")).toBeTruthy();
    // exports (2026-07-06): viewer can now generate + retrieve printable
    // reports, so /exports joins the viewer-allowed nav set.
    expect(getByText("exports")).toBeTruthy();
    // profile (2026-07-06): every role, including viewer, can reach its own
    // self-service Profile page (own password/email).
    expect(getByText("profile")).toBeTruthy();

    for (const key of ALL_NAV_LABEL_KEYS) {
      if (["dashboard", "map", "exports", "profile"].includes(key)) continue;
      expect(queryByText(key)).toBeNull();
    }
  });

  // tenant_manager + tenant_superadmin (2026-07-10, WIDENED — reverses the
  // 2026-07-07 tenant_manager-only lock): both roles see Users + Settings.
  // tenant_manager = platform; tenant_superadmin = the tenant's own owner.
  it.each(["tenant_manager", "tenant_superadmin"])(
    "renders the full nav (incl. users + settings) for %s",
    (role) => {
      stubs.sessionRoles = [role];
      const { getByText } = render(<Sidebar />);
      for (const key of ALL_NAV_LABEL_KEYS) {
        expect(getByText(key)).toBeTruthy();
      }
    },
  );

  // field_coordinator + operator: Users + Settings are gated to
  // tenant_manager/tenant_superadmin ONLY (userManagementProcedure) — these
  // roles hit FORBIDDEN on those pages. Hide the two nav items so no role
  // sees a menu it cannot use; every other item stays visible.
  it.each(["field_coordinator", "operator"])(
    "renders every nav item except 'users' and 'settings' for %s",
    (role) => {
      stubs.sessionRoles = [role];
      const { getByText, queryByText } = render(<Sidebar />);
      expect(queryByText("users")).toBeNull();
      expect(queryByText("settings")).toBeNull();
      for (const key of ALL_NAV_LABEL_KEYS) {
        if (key === "users" || key === "settings") continue;
        expect(getByText(key)).toBeTruthy();
      }
    },
  );

  // administrator role (2026-07-06, narrowed 2026-07-06) — full access to
  // every menu EXCEPT "users" (add/edit/deactivate accounts) AND "settings"
  // (tenant configuration — now super_admin/site_admin only). Deny-list,
  // unlike viewer's allow-list above. "profile" stays visible — it is never
  // added to the deny-list so administrator keeps its own self-service page.
  it("renders every nav item except 'users' and 'settings' for an administrator session", () => {
    stubs.sessionRoles = ["tenant_admin"];
    const { getByText, queryByText } = render(<Sidebar />);

    expect(queryByText("users")).toBeNull();
    expect(queryByText("settings")).toBeNull();
    expect(getByText("profile")).toBeTruthy();
    for (const key of ALL_NAV_LABEL_KEYS) {
      if (key === "users" || key === "settings") continue;
      expect(getByText(key)).toBeTruthy();
    }
  });

  it("hides users + settings (but shows every other item) when there is no session yet", () => {
    // No roles yet (session loading / unauthenticated render pass): treated as
    // non-site-admin, so the two site-admin-only items stay hidden rather than
    // flashing in before the session resolves. Route/tRPC layers enforce access.
    stubs.sessionRoles = [];
    stubs.sessionCustomRoleId = null;
    stubs.sessionCustomRolePermissions = null;
    const { getByText, queryByText } = render(<Sidebar />);
    expect(queryByText("users")).toBeNull();
    expect(queryByText("settings")).toBeNull();
    for (const key of ALL_NAV_LABEL_KEYS) {
      if (key === "users" || key === "settings") continue;
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
    stubs.sessionCustomRoleId = null;
    stubs.sessionCustomRolePermissions = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an Exports link to /exports, indented as a submenu under map", () => {
    const { getByText } = render(<Sidebar />);
    const exportsLabel = getByText("exports");
    const link = exportsLabel.closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/demo-site/exports");
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

// Custom-role matrix nav filtering (tenant-rbac-standard §4, surface 3 of
// 3 — tRPC matrixProcedure + route middleware + this sidebar). A session
// with `customRoleId` set is deny-by-default against `customRolePermissions`:
// only items whose feature key has `view === true` show, plus /dashboard +
// /profile which are always visible; /users + /settings are never grantable
// and stay hidden regardless of what the matrix contains.
describe("Sidebar — custom-role permission-matrix nav filtering", () => {
  beforeEach(() => {
    stubs.notificationsLength = 0;
    stubs.useQueryOpts = undefined;
    stubs.useQueryCalled = false;
    stubs.invalidateUnreadCount.mockReset();
    stubs.invalidateUnreadCount.mockResolvedValue(undefined);
    stubs.sessionRoles = [];
    stubs.sessionCustomRoleId = null;
    stubs.sessionCustomRolePermissions = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows only Events + Map (plus Dashboard + Profile) when the matrix grants view on events + map", () => {
    stubs.sessionCustomRoleId = "custom-role-1";
    stubs.sessionCustomRolePermissions = {
      events: { view: true, write: false, update: false, delete: false },
      map: { view: true, write: false, update: false, delete: false },
    };
    const { getByText, queryByText } = render(<Sidebar />);

    expect(getByText("dashboard")).toBeTruthy();
    expect(getByText("profile")).toBeTruthy();
    expect(getByText("events")).toBeTruthy();
    expect(getByText("map")).toBeTruthy();

    expect(queryByText("patrols")).toBeNull();
    expect(queryByText("patrolAreas")).toBeNull();
    expect(queryByText("patrolSchedule")).toBeNull();
    expect(queryByText("exports")).toBeNull();
    expect(queryByText("notifications")).toBeNull();
    expect(queryByText("fuel")).toBeNull();
    expect(queryByText("alerts")).toBeNull();
    expect(queryByText("subjects")).toBeNull();
    expect(queryByText("sync")).toBeNull();
    expect(queryByText("users")).toBeNull();
    expect(queryByText("settings")).toBeNull();
  });

  it("shows only Dashboard + Profile when the matrix grants nothing", () => {
    stubs.sessionCustomRoleId = "custom-role-2";
    stubs.sessionCustomRolePermissions = {};
    const { getByText, queryByText } = render(<Sidebar />);

    expect(getByText("dashboard")).toBeTruthy();
    expect(getByText("profile")).toBeTruthy();

    for (const key of [
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
    ]) {
      expect(queryByText(key)).toBeNull();
    }
  });

  it("never shows Users or Settings for a custom role, even if the matrix (incorrectly) grants them", () => {
    stubs.sessionCustomRoleId = "custom-role-3";
    stubs.sessionCustomRolePermissions = {
      users: { view: true, write: true, update: true, delete: true },
      settings: { view: true, write: true, update: true, delete: true },
    };
    const { queryByText } = render(<Sidebar />);
    expect(queryByText("users")).toBeNull();
    expect(queryByText("settings")).toBeNull();
  });
});
