/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * cmsDocs router tests (CMS_BUILD_PLAN.md — W3). Verifies: public reads
 * (tree/getBySlug) succeed for an anonymous caller; every write mutation
 * (create/update/delete/reorder) rejects both an anonymous caller AND a
 * non-platform-admin (tenant-scoped) caller. prisma + rate-limit + auth are
 * mocked (unit-level — no live DB), mirroring the municipality.test.ts /
 * breach.test.ts harness pattern.
 */

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    docPage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
  writeAuditLog: vi.fn(),
}));

vi.mock("../../../lib/rate-limit", () => ({
  rateLimiters: {
    public: { check: vi.fn() },
    api: { check: vi.fn() },
    auth: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("../../../auth", () => ({ auth: vi.fn() }));

import { prisma } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { cmsDocsRouter } from "../cmsDocs";

const createCaller = createCallerFactory(cmsDocsRouter);

const ANON_CTX = { session: null, ip: "127.0.0.1", impersonationTenantId: null };

function tenantUserCtx(roles: string[] = ["operator"], tenantId = "tenant-abc") {
  return {
    session: {
      user: { id: "user-1", tenantId, tenantSlug: "some-tenant", roles, email: "u@example.com", name: "U" },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

function platformAdminCtx() {
  return {
    session: {
      user: {
        id: "admin-1",
        tenantId: "",
        tenantSlug: "",
        roles: ["tenant_manager"],
        email: "admin@example.com",
        name: "Admin",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("cmsDocs — public reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tree: an anonymous caller can read the published nav tree", async () => {
    vi.mocked(prisma.docPage.findMany).mockResolvedValue([
      {
        slug: "index",
        parentSlug: null,
        kind: "folderIndex",
        title: "Docs",
        description: null,
        orderInParent: 0,
      },
      {
        slug: "getting-started",
        parentSlug: "index",
        kind: "page",
        title: "Getting Started",
        description: null,
        orderInParent: 0,
      },
      {
        slug: "guides",
        parentSlug: "index",
        kind: "folderIndex",
        title: "Guides",
        description: null,
        orderInParent: 1,
      },
      {
        slug: "guides/patrols",
        parentSlug: "guides",
        kind: "page",
        title: "Patrols",
        description: null,
        orderInParent: 0,
      },
    ] as any);

    const caller = createCaller(ANON_CTX as any);
    const tree = await caller.tree();

    expect(prisma.docPage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { published: true } }),
    );
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ slug: "getting-started", url: "/docs/getting-started" });
    expect(tree[1]).toMatchObject({ slug: "guides", url: "/docs/guides" });
    expect(tree[1]?.children).toHaveLength(1);
    expect(tree[1]?.children[0]).toMatchObject({
      slug: "guides/patrols",
      url: "/docs/guides/patrols",
    });
  });

  it("getBySlug: an anonymous caller can resolve a published page", async () => {
    vi.mocked(prisma.docPage.findUnique).mockResolvedValue({
      slug: "index",
      published: true,
      title: "Docs",
      bodyMarkdown: "# Hello",
    } as any);

    const caller = createCaller(ANON_CTX as any);
    const page = await caller.getBySlug({ slug: "index" });

    expect(page).toMatchObject({ slug: "index", bodyMarkdown: "# Hello" });
  });

  it("getBySlug: an unpublished page 404s even for an anonymous caller", async () => {
    vi.mocked(prisma.docPage.findUnique).mockResolvedValue({
      slug: "draft-page",
      published: false,
    } as any);

    const caller = createCaller(ANON_CTX as any);
    await expect(caller.getBySlug({ slug: "draft-page" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("cmsDocs — writes reject non-platform-admin callers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createInput = {
    slug: "new-page",
    parentSlug: "index",
    title: "New Page",
    bodyMarkdown: "content",
  };

  it("create: rejects an anonymous caller", async () => {
    const caller = createCaller(ANON_CTX as any);
    await expect(caller.create(createInput as any)).rejects.toBeInstanceOf(TRPCError);
    expect(prisma.docPage.create).not.toHaveBeenCalled();
  });

  it("create: rejects a tenant-scoped (non-platform-admin) caller", async () => {
    const caller = createCaller(tenantUserCtx(["tenant_superadmin"]) as any);
    await expect(caller.create(createInput as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.docPage.create).not.toHaveBeenCalled();
  });

  it("update: rejects an anonymous and a non-platform-admin caller", async () => {
    const anonCaller = createCaller(ANON_CTX as any);
    await expect(anonCaller.update({ slug: "index", title: "X" } as any)).rejects.toBeInstanceOf(
      TRPCError,
    );

    const tenantCaller = createCaller(tenantUserCtx() as any);
    await expect(
      tenantCaller.update({ slug: "index", title: "X" } as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(prisma.docPage.update).not.toHaveBeenCalled();
  });

  it("delete: rejects an anonymous and a non-platform-admin caller", async () => {
    const anonCaller = createCaller(ANON_CTX as any);
    await expect(anonCaller.delete({ slug: "index" })).rejects.toBeInstanceOf(TRPCError);

    const tenantCaller = createCaller(tenantUserCtx() as any);
    await expect(tenantCaller.delete({ slug: "index" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(prisma.docPage.delete).not.toHaveBeenCalled();
  });

  it("reorder: rejects an anonymous and a non-platform-admin caller", async () => {
    const items = { items: [{ slug: "index", orderInParent: 1 }] };

    const anonCaller = createCaller(ANON_CTX as any);
    await expect(anonCaller.reorder(items)).rejects.toBeInstanceOf(TRPCError);

    const tenantCaller = createCaller(tenantUserCtx() as any);
    await expect(tenantCaller.reorder(items)).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("cmsDocs — writes succeed for a platform admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create: a platform admin can create a page", async () => {
    vi.mocked(prisma.docPage.create).mockResolvedValue({
      id: "doc-1",
      slug: "new-page",
    } as any);

    const caller = createCaller(platformAdminCtx() as any);
    const row = await caller.create({
      slug: "new-page",
      parentSlug: "index",
      title: "New Page",
      bodyMarkdown: "content",
    } as any);

    expect(row).toMatchObject({ id: "doc-1", slug: "new-page" });
    expect(prisma.docPage.create).toHaveBeenCalled();
  });

  it("update: a platform admin can update a page (only patched fields sent)", async () => {
    vi.mocked(prisma.docPage.findUnique).mockResolvedValue({ id: "doc-1", slug: "index" } as any);
    vi.mocked(prisma.docPage.update).mockResolvedValue({ id: "doc-1", slug: "index" } as any);

    const caller = createCaller(platformAdminCtx() as any);
    await caller.update({ slug: "index", title: "Updated Title" } as any);

    const call = vi.mocked(prisma.docPage.update).mock.calls[0]?.[0];
    expect(call?.data).toMatchObject({ title: "Updated Title", updatedById: "admin-1" });
    expect(call?.data).not.toHaveProperty("bodyMarkdown");
  });
});
