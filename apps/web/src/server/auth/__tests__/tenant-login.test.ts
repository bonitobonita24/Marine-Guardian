// tenant-login.test.ts
//
// Path-based multi-tenancy (feat/tenant-path-routing) — authorize() binding.
// Proves the per-tenant login (/[tenant]/login) is bound to its URL slug and
// that the platform /login is reserved for super_admin / platform users:
//   1. A tenant user signing in with the MATCHING tenantSlug succeeds and the
//      result carries tenantSlug.
//   2. A tenant user signing in with a DIFFERENT tenantSlug is rejected (the
//      cross-tenant-login attack: valid password for tenant A at /tenant-b/login).
//   3. A super_admin (tenantId === null) signing in on a tenant login (any
//      tenantSlug) is rejected.
//   4. A super_admin signing in on the platform /login (no tenantSlug) succeeds
//      with tenantSlug === "".
//   5. A tenant user signing in on the platform /login (no tenantSlug) is
//      rejected — tenant users must use their own /[tenant]/login.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique, mockCompare } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCompare: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: mockCompare, hash: vi.fn() },
}));

import { authConfig } from "../config";

// Extract the Credentials provider's authorize(). next-auth v5 stores the
// resolved provider config object (with .authorize) at providers[0].
interface AuthorizeResult {
  id: string;
  tenantId: string | null;
  tenantSlug: string;
  roles: string[];
}
type AuthorizeFn = (
  credentials: Record<string, unknown>,
) => Promise<AuthorizeResult | null>;

function getAuthorize(): AuthorizeFn {
  // The unit under test is the authorize() we wrote — @auth/core exposes it at
  // provider.options.authorize (provider.authorize is the wrapper that strips
  // undeclared credential fields; not what this test targets).
  const provider = authConfig.providers[0] as unknown as {
    options: { authorize: AuthorizeFn };
  };
  return provider.options.authorize.bind(provider);
}

const TENANT_USER = {
  id: "u-tenant",
  email: "ranger@demo.com",
  fullName: "Demo Ranger",
  passwordHash: "hash",
  isActive: true,
  role: "operator",
  securityVersion: 1,
  tenantId: "t-demo",
  tenant: { slug: "demo-site" },
};

const SUPER_ADMIN = {
  id: "u-super",
  email: "admin@platform.com",
  fullName: "Platform Admin",
  passwordHash: "hash",
  isActive: true,
  role: "tenant_manager",
  securityVersion: 1,
  tenantId: null,
  tenant: null,
};

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCompare.mockReset();
  mockCompare.mockResolvedValue(true);
});

describe("authorize() — per-tenant login slug binding", () => {
  it("accepts a tenant user whose slug matches the submitted tenantSlug", async () => {
    mockFindUnique.mockResolvedValue(TENANT_USER);
    const result = await getAuthorize()({
      email: TENANT_USER.email,
      password: "pw",
      tenantSlug: "demo-site",
    });
    expect(result).not.toBeNull();
    expect(result?.tenantSlug).toBe("demo-site");
    expect(result?.tenantId).toBe("t-demo");
  });

  it("REJECTS a tenant user when the submitted tenantSlug is a DIFFERENT tenant (cross-tenant login attack)", async () => {
    mockFindUnique.mockResolvedValue(TENANT_USER);
    const result = await getAuthorize()({
      email: TENANT_USER.email,
      password: "pw",
      tenantSlug: "some-other-tenant",
    });
    expect(result).toBeNull();
  });

  it("REJECTS a super_admin attempting a tenant login (tenantSlug submitted)", async () => {
    mockFindUnique.mockResolvedValue(SUPER_ADMIN);
    const result = await getAuthorize()({
      email: SUPER_ADMIN.email,
      password: "pw",
      tenantSlug: "demo-site",
    });
    expect(result).toBeNull();
  });
});

describe("authorize() — platform /login (no tenantSlug)", () => {
  it("accepts a super_admin with no tenantSlug, tenantSlug === \"\"", async () => {
    mockFindUnique.mockResolvedValue(SUPER_ADMIN);
    const result = await getAuthorize()({
      email: SUPER_ADMIN.email,
      password: "pw",
    });
    expect(result).not.toBeNull();
    expect(result?.tenantId).toBeNull();
    expect(result?.tenantSlug).toBe("");
  });

  it("REJECTS a tenant user on the platform login (no tenantSlug)", async () => {
    mockFindUnique.mockResolvedValue(TENANT_USER);
    const result = await getAuthorize()({
      email: TENANT_USER.email,
      password: "pw",
    });
    expect(result).toBeNull();
  });

  it("treats an empty-string tenantSlug the same as platform login", async () => {
    mockFindUnique.mockResolvedValue(SUPER_ADMIN);
    const result = await getAuthorize()({
      email: SUPER_ADMIN.email,
      password: "pw",
      tenantSlug: "",
    });
    expect(result).not.toBeNull();
    expect(result?.tenantSlug).toBe("");
  });
});
