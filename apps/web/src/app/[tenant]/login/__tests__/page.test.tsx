// login/page.tsx — the per-tenant login page (/[tenant]/login).
//
// It sits OUTSIDE (dashboard)/layout.tsx, so an unauthenticated request must be
// able to render it (this is the page the auth gate redirects to — it must never
// itself redirect an unauthenticated visitor, or the login flow infinite-loops).
// An already-authenticated visitor is bounced to their tenant dashboard so we
// never render a login form to a signed-in user.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockRedirect } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  // redirect() never returns in Next; model it as a throw so control stops and
  // the target is capturable.
  mockRedirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

vi.mock("@/server/auth", () => ({ auth: mockAuth }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
// Avoid pulling the client form's dependency chain (next-intl, ui components).
vi.mock("../tenant-login-form", () => ({ TenantLoginForm: () => null }));

import TenantLoginPage from "../page";

async function run(tenant: string) {
  return TenantLoginPage({ params: Promise.resolve({ tenant }) });
}

function tenantUser(slug: string, roles = ["operator"]) {
  return { user: { id: "u", tenantId: "t", tenantSlug: slug, roles } };
}

beforeEach(() => {
  mockAuth.mockReset();
  mockRedirect.mockClear();
});

describe("[tenant]/login page", () => {
  it("renders (does NOT redirect) for an unauthenticated visitor — no redirect loop", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(run("demo-site")).resolves.toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects an already-authenticated visitor to their tenant dashboard", async () => {
    mockAuth.mockResolvedValue(tenantUser("demo-site"));
    await expect(run("demo-site")).rejects.toThrow("REDIRECT:/demo-site/dashboard");
  });
});
