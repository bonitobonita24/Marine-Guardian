// viewer role (2026-07-05) route-gate tests for middleware.ts.
//
// A viewer session must be redirected to /dashboard when it requests any
// tenant page outside Command Center (/dashboard) or Interactive Report Map
// (/map). This is the load-bearing enforcement — sidebar.tsx nav-hiding alone
// is cosmetic; a bookmarked/typed URL must still be blocked here.
//
// next-auth's `auth()` is mocked so each test controls the session directly
// without a real JWT round-trip. edgeAuthConfig is a plain object with no
// side effects, so it does not need mocking.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth }),
}));

import middleware from "../middleware";

function makeSession(roles: string[], tenantId = "tenant-1") {
  return {
    user: {
      id: "user-1",
      tenantId,
      tenantSlug: "demo-site",
      roles,
    },
  };
}

function makeRequest(pathname: string): NextRequest {
  const p = pathname.startsWith("/api") ? pathname : `/demo-site${pathname}`;
  return new NextRequest(new URL(p, "https://app.example.com"));
}

describe("middleware — viewer role route gate", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("redirects a viewer requesting /events to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const res = await middleware(makeRequest("/events"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/demo-site/dashboard");
  });

  it("redirects a viewer requesting /users to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const res = await middleware(makeRequest("/users"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/demo-site/dashboard");
  });

  it("allows a viewer requesting /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const res = await middleware(makeRequest("/dashboard"));
    expect(res.status).toBe(200);
  });

  it("allows a viewer requesting /map (and nested map sub-paths)", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const resMap = await middleware(makeRequest("/map"));
    expect(resMap.status).toBe(200);
    const resNested = await middleware(makeRequest("/map/details"));
    expect(resNested.status).toBe(200);
  });

  // 2026-07-06: a viewer can generate a printable report from /map
  // (reportGenerateProcedure) and must be able to reach /exports to
  // retrieve it — /exports joins the viewer-allowed route set.
  it("allows a viewer requesting /exports (and nested export sub-paths)", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const resExports = await middleware(makeRequest("/exports"));
    expect(resExports.status).toBe(200);
    const resNested = await middleware(makeRequest("/exports/re-1"));
    expect(resNested.status).toBe(200);
  });

  // 2026-07-06: every role, including viewer, gets a self-service Profile
  // page (own password/email) — /profile joins the viewer-allowed route set.
  it("allows a viewer requesting /profile", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const res = await middleware(makeRequest("/profile"));
    expect(res.status).toBe(200);
  });

  it("does NOT redirect a viewer requesting an /api route (e.g. the notification SSE stream)", async () => {
    // API authorization is enforced at the route / tRPC layer (viewer is
    // read-only there); the page-navigation gate must never redirect /api/*,
    // or the dashboard's EventSource stream breaks (HTML → MIME error).
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const res = await middleware(makeRequest("/api/stream/notifications"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does NOT redirect a non-viewer (operator) requesting /events", async () => {
    mockAuth.mockResolvedValue(makeSession(["operator"]));
    const res = await middleware(makeRequest("/events"));
    expect(res.status).toBe(200);
  });

  // 2026-07-07: /users is now super_admin ONLY, so a field_coordinator (like
  // every non-super_admin role) is redirected to /dashboard by the
  // super_admin-only gate — it is no longer merely "not the viewer gate's job".
  it("redirects a non-viewer (field_coordinator) requesting /users to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["field_coordinator"]));
    const res = await middleware(makeRequest("/users"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/demo-site/dashboard");
  });
});

// administrator role (2026-07-06, narrowed 2026-07-06) route-gate tests.
// Full access to every tenant page EXCEPT /users (user management) AND
// /settings (tenant configuration — super_admin/site_admin only) — a
// deny-list, unlike viewer's allow-list above.
describe("middleware — administrator role route gate", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("redirects an administrator requesting /users to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_admin"]));
    const res = await middleware(makeRequest("/users"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/demo-site/dashboard");
  });

  it("redirects an administrator requesting a nested /users sub-path to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_admin"]));
    const res = await middleware(makeRequest("/users/some-id"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/demo-site/dashboard");
  });

  // Settings (2026-07-06): removed from administrator alongside Users.
  it("redirects an administrator requesting /settings to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_admin"]));
    const res = await middleware(makeRequest("/settings"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/demo-site/dashboard");
  });

  it("redirects an administrator requesting nested /settings sub-paths (report-templates, breach) to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_admin"]));
    for (const path of ["/settings/report-templates", "/settings/breach"]) {
      const res = await middleware(makeRequest(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://app.example.com/demo-site/dashboard");
    }
  });

  it("allows an administrator requesting every other tenant page (e.g. /events, /alerts, /profile)", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_admin"]));
    for (const path of ["/dashboard", "/map", "/events", "/profile", "/alerts", "/patrols"]) {
      const res = await middleware(makeRequest(path));
      expect(res.status).toBe(200);
    }
  });

  it("does NOT redirect an administrator requesting an /api route", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_admin"]));
    const res = await middleware(makeRequest("/api/stream/notifications"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  // 2026-07-10: /users + /settings WIDENED to tenant_manager + tenant_superadmin
  // (reverses the 2026-07-07 tenant_manager-only lock — see
  // docs/plans/tenant-rbac-3tier-plan.md). tenant_superadmin is the tenant's
  // own owner and must reach its tenant's user management + settings.
  it("does NOT redirect a tenant_superadmin requesting /users or /settings", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_superadmin"]));
    const resUsers = await middleware(makeRequest("/users"));
    expect(resUsers.status).toBe(200);
    const resSettings = await middleware(makeRequest("/settings"));
    expect(resSettings.status).toBe(200);
  });

  // tenant_manager (platform) is also allowed onto /users + /settings — the
  // gate must let it through.
  it("does NOT redirect a tenant_manager requesting /users or /settings", async () => {
    mockAuth.mockResolvedValue(makeSession(["tenant_manager"]));
    const resUsers = await middleware(makeRequest("/users"));
    expect(resUsers.status).toBe(200);
    const resSettings = await middleware(makeRequest("/settings"));
    expect(resSettings.status).toBe(200);
  });
});
