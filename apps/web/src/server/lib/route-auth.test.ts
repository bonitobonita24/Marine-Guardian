// route-auth.test.ts
//
// Unit tests for requireRouteAuth() verifying that:
// 1. Unauthenticated / incomplete sessions → 401
// 2. Regular users use session.tenantId regardless of cookie
// 3. super_admin with empty session.tenantId + valid cookie → impersonation
// 4. Defense-in-depth: non-super_admin with empty tenantId + cookie → 401
// 5. Malformed cookie → 401

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — vi.hoisted ensures variables are available before imports
// ---------------------------------------------------------------------------

const { mockAuth, mockCookieGet } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCookieGet: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ auth: mockAuth }));

vi.mock("next/headers", () => ({
  // eslint-disable-next-line @typescript-eslint/require-await
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

import { requireRouteAuth, RouteAuthError } from "./route-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TENANT_ID = "clxxxxxxxxxxxxxxxxxxxxxx"; // 22-char cuid-compatible
const USER_ID = "user-1";

function makeSession(overrides: {
  id?: string;
  tenantId?: string;
  roles?: string[];
}) {
  return {
    user: {
      id: overrides.id ?? USER_ID,
      tenantId: overrides.tenantId ?? "tenant-a",
      roles: overrides.roles ?? ["patrol_lead"],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no impersonation cookie present
  mockCookieGet.mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requireRouteAuth", () => {
  // Case 1 — null session → 401
  it("throws RouteAuthError 401 when session is null", async () => {
    mockAuth.mockResolvedValue(null);

    let caught: unknown;
    try { await requireRouteAuth(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RouteAuthError);
    expect((caught as RouteAuthError).response.status).toBe(401);
  });

  // Case 2 — empty user.id → 401
  it("throws RouteAuthError 401 when user.id is empty", async () => {
    mockAuth.mockResolvedValue(makeSession({ id: "" }));

    let caught: unknown;
    try { await requireRouteAuth(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RouteAuthError);
    expect((caught as RouteAuthError).response.status).toBe(401);
  });

  // Case 3 — regular user, session tenantId present, no cookie → returns session tenant
  it("returns session tenantId for a regular user with no cookie", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "tenant-a", roles: ["patrol_lead"] }));
    mockCookieGet.mockReturnValue(undefined);

    const ctx = await requireRouteAuth();
    expect(ctx.tenantId).toBe("tenant-a");
    expect(ctx.userId).toBe(USER_ID);
    expect(ctx.isPlatformImpersonating).toBe(false);
  });

  // Case 4 — regular user, session tenantId present, cookie ALSO present → cookie ignored
  it("ignores impersonation cookie for non-super_admin", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "tenant-a", roles: ["patrol_lead"] }));
    mockCookieGet.mockReturnValue({ value: VALID_TENANT_ID });

    const ctx = await requireRouteAuth();
    expect(ctx.tenantId).toBe("tenant-a");
    expect(ctx.isPlatformImpersonating).toBe(false);
  });

  // Case 5 — super_admin, empty session.tenantId, NO cookie → 401 (existing behavior)
  it("throws 401 for super_admin with empty tenantId and no cookie", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "", roles: ["tenant_manager"] }));
    mockCookieGet.mockReturnValue(undefined);

    let caught: unknown;
    try { await requireRouteAuth(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RouteAuthError);
    expect((caught as RouteAuthError).response.status).toBe(401);
  });

  // Case 6 — super_admin, empty session.tenantId, valid cookie → impersonation (NEW)
  it("returns cookie tenantId for super_admin impersonating a tenant", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "", roles: ["tenant_manager"] }));
    mockCookieGet.mockReturnValue({ value: VALID_TENANT_ID });

    const ctx = await requireRouteAuth();
    expect(ctx.tenantId).toBe(VALID_TENANT_ID);
    expect(ctx.isPlatformImpersonating).toBe(true);
    expect(ctx.roles).toContain("tenant_manager");
  });

  // Case 7 — super_admin with OWN tenant + cookie → session tenant wins (not impersonating)
  it("returns session tenantId for super_admin who has their own tenant (cookie ignored)", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "tenant-a", roles: ["tenant_manager"] }));
    mockCookieGet.mockReturnValue({ value: VALID_TENANT_ID });

    const ctx = await requireRouteAuth();
    expect(ctx.tenantId).toBe("tenant-a");
    expect(ctx.isPlatformImpersonating).toBe(false);
  });

  // Case 8 — non-super_admin with empty session.tenantId + cookie → 401 (defense-in-depth)
  it("throws 401 for non-super_admin with empty tenantId even if cookie is present", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "", roles: ["patrol_lead"] }));
    mockCookieGet.mockReturnValue({ value: VALID_TENANT_ID });

    let caught: unknown;
    try { await requireRouteAuth(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RouteAuthError);
    expect((caught as RouteAuthError).response.status).toBe(401);
  });

  // Case 9 — super_admin, empty tenantId, malformed cookie → 401
  it("throws 401 for super_admin with malformed impersonation cookie", async () => {
    mockAuth.mockResolvedValue(makeSession({ tenantId: "", roles: ["tenant_manager"] }));
    mockCookieGet.mockReturnValue({ value: "../etc/passwd" });

    let caught: unknown;
    try { await requireRouteAuth(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RouteAuthError);
    expect((caught as RouteAuthError).response.status).toBe(401);
  });
});
