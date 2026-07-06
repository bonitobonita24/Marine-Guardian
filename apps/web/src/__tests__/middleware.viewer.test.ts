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
      roles,
    },
  };
}

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "https://app.example.com"));
}

describe("middleware — viewer role route gate", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("redirects a viewer requesting /events to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const res = await middleware(makeRequest("/events"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("redirects a viewer requesting /users to /dashboard", async () => {
    mockAuth.mockResolvedValue(makeSession(["viewer"]));
    const res = await middleware(makeRequest("/users"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/dashboard");
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

  it("does NOT redirect a non-viewer (field_coordinator) requesting /users", async () => {
    mockAuth.mockResolvedValue(makeSession(["field_coordinator"]));
    const res = await middleware(makeRequest("/users"));
    expect(res.status).toBe(200);
  });
});
