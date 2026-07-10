// [tenant]/layout.tsx — server-side slug-validation gate (defense-in-depth L2).
// Proves the SECURITY behavior: a normal user whose authenticated tenantSlug
// does not match the requested [tenant] URL segment is redirected to their own
// tenant dashboard (they can never even render another tenant's page shell),
// and a platform super_admin is confined to the tenant named by the
// mg-impersonate-slug cookie.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockRedirect, mockNotFound, mockFindUnique, cookieStore } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  // redirect() never returns in Next; model it as a throw so control stops and
  // the target is capturable.
  mockRedirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  // notFound() also never returns; model it as a distinct throw.
  mockNotFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  // Unknown-tenant guard looks the slug up; default: the tenant exists.
  mockFindUnique: vi.fn(),
  cookieStore: { get: vi.fn() },
}));

vi.mock("@/server/auth", () => ({ auth: mockAuth }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect, notFound: mockNotFound }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));
vi.mock("@marine-guardian/db", () => ({
  prisma: { tenant: { findUnique: mockFindUnique } },
}));

import TenantLayout from "../layout";

const children = null;

async function run(tenant: string) {
  return TenantLayout({ children, params: Promise.resolve({ tenant }) });
}

function tenantUser(slug: string, roles = ["operator"]) {
  return { user: { id: "u", tenantId: "t", tenantSlug: slug, roles } };
}
function platformAdmin() {
  return { user: { id: "s", tenantId: "", tenantSlug: "", roles: ["tenant_manager"] } };
}

beforeEach(() => {
  mockAuth.mockReset();
  mockRedirect.mockClear();
  mockNotFound.mockClear();
  mockFindUnique.mockReset();
  // Default: the requested tenant exists (so session-less pass-through cases run).
  mockFindUnique.mockResolvedValue({ id: "t" });
  cookieStore.get.mockReset();
  cookieStore.get.mockReturnValue(undefined);
});

describe("[tenant]/layout — static-asset segment guard", () => {
  it("returns 404 (notFound) for a root static-asset segment, NOT a tenant redirect", async () => {
    // Regression: /favicon.ico, /robots.txt etc. fall through to this catch-all
    // [tenant] route; they must 404, never 307 into /<file>/dashboard.
    mockAuth.mockResolvedValue(null);
    await expect(run("favicon.ico")).rejects.toThrow("NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns 404 for robots.txt without invoking auth", async () => {
    await expect(run("robots.txt")).rejects.toThrow("NOT_FOUND");
    expect(mockAuth).not.toHaveBeenCalled();
  });
});

describe("[tenant]/layout — slug validation gate", () => {
  it("does NOT redirect an unauthenticated request — it passes through so the child /[tenant]/login page can render (no redirect loop)", async () => {
    // Regression: this layout wraps BOTH /[tenant]/login and (dashboard)/*.
    // Redirecting a session-less request to /[tenant]/login here re-enters this
    // same layout for the login page and infinite-loops (ERR_TOO_MANY_REDIRECTS).
    // The unauth→login gate lives in (dashboard)/layout.tsx instead.
    mockAuth.mockResolvedValue(null);
    await expect(run("demo-site")).resolves.toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns 404 for a session-less request to an UNKNOWN tenant slug (stale/renamed URL)", async () => {
    // Regression: after a tenant is renamed (demo-site -> ph) or on a typo, the
    // catch-all [tenant] must not render a dead login shell — it 404s.
    mockAuth.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    await expect(run("demo-site")).rejects.toThrow("NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("SECURITY: redirects a normal user off a MISMATCHED tenant to their own dashboard", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site"));
    await expect(run("other-tenant")).rejects.toThrow("REDIRECT:/demo-site/dashboard");
  });

  it("allows a normal user on their OWN tenant (no redirect)", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site"));
    await expect(run("demo-site")).resolves.toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects a non-impersonating platform super_admin to /admin", async () => {
    mockAuth.mockResolvedValue(platformAdmin());
    cookieStore.get.mockReturnValue(undefined);
    await expect(run("demo-site")).rejects.toThrow("REDIRECT:/admin");
  });

  it("allows an impersonating super_admin only on the impersonated tenant", async () => {
    mockAuth.mockResolvedValue(platformAdmin());
    cookieStore.get.mockReturnValue({ value: "demo-site" });
    await expect(run("demo-site")).resolves.toBeDefined();

    // mismatched impersonation slug → back to /admin
    mockAuth.mockResolvedValue(platformAdmin());
    cookieStore.get.mockReturnValue({ value: "demo-site" });
    await expect(run("other-tenant")).rejects.toThrow("REDIRECT:/admin");
  });
});
