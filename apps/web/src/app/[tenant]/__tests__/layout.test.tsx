// [tenant]/layout.tsx — server-side slug-validation gate (defense-in-depth L2).
// Proves the SECURITY behavior: a normal user whose authenticated tenantSlug
// does not match the requested [tenant] URL segment is redirected to their own
// tenant dashboard (they can never even render another tenant's page shell),
// and a platform super_admin is confined to the tenant named by the
// mg-impersonate-slug cookie.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockRedirect, cookieStore } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  // redirect() never returns in Next; model it as a throw so control stops and
  // the target is capturable.
  mockRedirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  cookieStore: { get: vi.fn() },
}));

vi.mock("@/server/auth", () => ({ auth: mockAuth }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

import TenantLayout from "../layout";

const children = null;

async function run(tenant: string) {
  return TenantLayout({ children, params: Promise.resolve({ tenant }) });
}

function tenantUser(slug: string, roles = ["operator"]) {
  return { user: { id: "u", tenantId: "t", tenantSlug: slug, roles } };
}
function platformAdmin() {
  return { user: { id: "s", tenantId: "", tenantSlug: "", roles: ["super_admin"] } };
}

beforeEach(() => {
  mockAuth.mockReset();
  mockRedirect.mockClear();
  cookieStore.get.mockReset();
  cookieStore.get.mockReturnValue(undefined);
});

describe("[tenant]/layout — slug validation gate", () => {
  it("redirects an unauthenticated request to the tenant login", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(run("demo-site")).rejects.toThrow("REDIRECT:/demo-site/login");
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
