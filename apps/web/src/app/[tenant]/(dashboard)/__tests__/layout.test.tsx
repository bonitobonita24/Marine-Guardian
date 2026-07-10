// layout.test.tsx
//
// Bug #6 — the (dashboard) layout must redirect super_admins with no home tenant
// (session.tenantId === "") to the /admin platform console, EXCEPT while they are
// actively impersonating a tenant via the mg-impersonate-tenant cookie (Item 4).
//
// Verifies:
// 1. super_admin + empty tenantId + no impersonation cookie → redirect("/admin")
// 2. super_admin + empty tenantId + valid impersonation cookie → NO redirect
// 3. regular tenant user → NO redirect

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — vi.hoisted ensures variables exist before imports are resolved
// ---------------------------------------------------------------------------

const { mockAuth, mockRedirect, mockCookieGet } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  // redirect() never returns in Next; model it as a throw so control stops
  // (exactly as it does at runtime) and the target is capturable.
  mockRedirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  mockCookieGet: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: mockAuth }));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

// File-level override of the global next-headers auto-mock so we can control the
// impersonation cookie value per test.
vi.mock("next/headers", () => ({
  // eslint-disable-next-line @typescript-eslint/require-await
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

import DashboardLayout from "../layout";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TENANT_ID = "clxxxxxxxxxxxxxxxxxxxxxx"; // 24-char cuid-compatible

function makeSession(overrides: { tenantId?: string; roles?: string[] }) {
  return {
    user: {
      id: "user-1",
      email: "admin@example.com",
      name: "Admin",
      tenantId: overrides.tenantId ?? "",
      roles: overrides.roles ?? ["tenant_manager"],
    },
  };
}

// Invoke the async server component; we never render the returned element so the
// client child components (Sidebar/Header/etc.) are not executed.
async function renderLayout(tenant = "demo-site") {
  return DashboardLayout({ children: null, params: Promise.resolve({ tenant }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieGet.mockReturnValue(undefined); // default: no impersonation cookie
});

describe("(dashboard) layout — server auth gate (defense-in-depth L2)", () => {
  // This gate MOVED here from [tenant]/layout.tsx to break the login redirect
  // loop: (dashboard)/layout wraps only the authed pages, NOT the sibling
  // /[tenant]/login page, so redirecting an unauthenticated request to the
  // tenant login cannot re-enter itself.
  it("redirects an unauthenticated request to the tenant login (server gate holds even if middleware is bypassed)", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(renderLayout("demo-site")).rejects.toThrow(
      "REDIRECT:/demo-site/login",
    );
  });

  it("does NOT redirect an authenticated tenant user (renders the dashboard shell)", async () => {
    mockAuth.mockResolvedValue(
      makeSession({ tenantId: VALID_TENANT_ID, roles: ["ranger"] }),
    );

    await renderLayout("demo-site");

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("(dashboard) layout — Bug #6 super_admin null-tenant redirect", () => {
  it("redirects a super_admin with empty tenantId and no impersonation cookie to /admin", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "", roles: ["tenant_manager"] }));

    await expect(renderLayout()).rejects.toThrow("REDIRECT:/admin");

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("does NOT redirect a super_admin who is impersonating a tenant via cookie", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "", roles: ["tenant_manager"] }));
    mockCookieGet.mockReturnValue({ value: VALID_TENANT_ID });

    await renderLayout();

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("does NOT redirect a regular tenant-scoped user", async () => {
    mockAuth.mockResolvedValue(
      makeSession({ tenantId: VALID_TENANT_ID, roles: ["ranger"] }),
    );

    await renderLayout();

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
