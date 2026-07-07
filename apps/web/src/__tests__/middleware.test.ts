// middleware.test.ts
//
// Path-based multi-tenancy — edge middleware tenant-isolation coverage.
// The middleware is JWT-only (no Prisma at the edge): the requested URL slug is
// compared against the tenantSlug CLAIM in the session. Proves in particular the
// SECURITY-critical case: a normal user CANNOT reach another tenant by editing
// the URL (cross-tenant URL access denied).

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

// NextAuth(edgeAuthConfig) is called at module load; return our controllable auth().
vi.mock("next-auth", () => ({ default: vi.fn(() => ({ auth: mockAuth })) }));
// service-token-guard is edge-safe but mock it to a deterministic false so the
// print-render / asset branches never accidentally pass in these tests.
vi.mock("@/server/lib/service-token-guard", () => ({
  verifyServiceToken: vi.fn(() => false),
}));

import middleware from "../middleware";

interface Session {
  user: { id: string; tenantId: string; tenantSlug: string; roles: string[] };
}

function makeReq(
  pathname: string,
  opts: { cookies?: Record<string, string>; headers?: Record<string, string> } = {},
): NextRequest {
  const url = `http://localhost${pathname}`;
  const cookies = opts.cookies ?? {};
  const headers = opts.headers ?? {};
  return {
    nextUrl: new URL(url),
    url,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    cookies: {
      get: (name: string) =>
        name in cookies ? { value: cookies[name] } : undefined,
    },
  } as unknown as NextRequest;
}

function tenantUser(slug: string, roles: string[] = ["operator"]): Session {
  return { user: { id: "u", tenantId: "t", tenantSlug: slug, roles } };
}
function platformAdmin(): Session {
  return { user: { id: "s", tenantId: "", tenantSlug: "", roles: ["super_admin"] } };
}

// A redirect response exposes a Location header; next() does not.
function locationOf(res: Response): string | null {
  return res.headers.get("location");
}

beforeEach(() => {
  mockAuth.mockReset();
});

describe("middleware — unauthenticated", () => {
  it("redirects a tenant deep-link to that tenant's login with callbackUrl", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await middleware(makeReq("/demo-site/map"));
    const loc = locationOf(res);
    expect(loc).toContain("/demo-site/login");
    expect(loc).toContain("callbackUrl=%2Fdemo-site%2Fmap");
  });

  it("redirects /admin to the platform /login", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await middleware(makeReq("/admin"));
    expect(locationOf(res)).toContain("/login");
  });

  it("lets the per-tenant login page through (public)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await middleware(makeReq("/demo-site/login"));
    expect(locationOf(res)).toBeNull();
  });
});

describe("middleware — cross-tenant URL access (SECURITY)", () => {
  it("DENIES a tenant user editing the URL to another tenant → bounced to own dashboard", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site"));
    const res = await middleware(makeReq("/other-tenant/map"));
    expect(locationOf(res)).toContain("/demo-site/dashboard");
  });

  it("ALLOWS a tenant user on their own tenant path", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site"));
    const res = await middleware(makeReq("/demo-site/map"));
    expect(locationOf(res)).toBeNull();
  });

  it("DENIES a tenant user reaching /admin → own dashboard", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site"));
    const res = await middleware(makeReq("/admin"));
    expect(locationOf(res)).toContain("/demo-site/dashboard");
  });
});

describe("middleware — platform super_admin", () => {
  it("allows the platform console at /admin", async () => {
    mockAuth.mockResolvedValue(platformAdmin());
    const res = await middleware(makeReq("/admin/tenants"));
    expect(locationOf(res)).toBeNull();
  });

  it("bounces a non-impersonating super_admin off a tenant path to /admin", async () => {
    mockAuth.mockResolvedValue(platformAdmin());
    const res = await middleware(makeReq("/demo-site/dashboard"));
    expect(locationOf(res)).toContain("/admin");
  });

  it("allows an impersonating super_admin ONLY on the impersonated tenant", async () => {
    mockAuth.mockResolvedValue(platformAdmin());
    const ok = await middleware(
      makeReq("/demo-site/dashboard", { cookies: { "mg-impersonate-slug": "demo-site" } }),
    );
    expect(locationOf(ok)).toBeNull();

    const wrong = await middleware(
      makeReq("/other-tenant/dashboard", { cookies: { "mg-impersonate-slug": "demo-site" } }),
    );
    expect(locationOf(wrong)).toContain("/admin");
  });
});

describe("middleware — in-tenant role gates (slug-stripped)", () => {
  it("redirects a viewer off a non-allowed page to their dashboard", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site", ["viewer"]));
    const res = await middleware(makeReq("/demo-site/settings"));
    expect(locationOf(res)).toContain("/demo-site/dashboard");
  });

  it("allows a viewer on an allow-listed page (/map)", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site", ["viewer"]));
    const res = await middleware(makeReq("/demo-site/map"));
    expect(locationOf(res)).toBeNull();
  });

  it("redirects a non-super_admin off /settings (super_admin-only)", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site", ["operator"]));
    const res = await middleware(makeReq("/demo-site/settings/breach"));
    expect(locationOf(res)).toContain("/demo-site/dashboard");
  });

  it("allows super_admin-with-tenant on /settings", async () => {
    // (a super_admin bound to a tenant — tenantSlug non-empty — is not a platform
    // user; the in-tenant super_admin-only gate must let them through)
    mockAuth.mockResolvedValue(tenantUser("demo-site", ["super_admin"]));
    const res = await middleware(makeReq("/demo-site/settings"));
    expect(locationOf(res)).toBeNull();
  });
});
