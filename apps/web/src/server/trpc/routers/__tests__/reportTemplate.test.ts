import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * ReportTemplate router unit tests (S4 / V32.9).
 * Covers: tenant isolation, RBAC, setDefault sibling unset, delete audit, logo upload.
 */

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    reportTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  writeAuditLog: vi.fn(),
}));

vi.mock("@marine-guardian/storage", () => ({
  uploadImage: vi.fn(),
  buildLogoKey: vi.fn(
    (tenantId: string, templateId: string, ext: string) =>
      `logos/${tenantId}/${templateId}.${ext}`,
  ),
  getExportsBucketName: vi.fn(() => "marine-guardian-test-exports"),
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

import { prisma, writeAuditLog } from "@marine-guardian/db";
import { uploadImage } from "@marine-guardian/storage";
import { createCallerFactory } from "../../trpc";
import { reportTemplateRouter } from "../reportTemplate";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(reportTemplateRouter);

const TENANT_ID = "tenant-abc";
const OTHER_TENANT_ID = "tenant-xyz";
const USER_ID = "admin-1";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["tenant_manager"],
  userId: string = USER_ID,
) {
  return {
    session: {
      user: {
        id: userId,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles,
        email: "admin@example.com",
        name: "Admin User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const STUB_TEMPLATE = {
  id: "tmpl-1",
  tenantId: TENANT_ID,
  name: "Standard Report",
  layout: "portrait-one-per-page" as const,
  municipalLogoKey: null,
  partnerLogoKey: null,
  reportTitle: "Marine Guardian Report",
  footerNotes: null,
  isDefault: false,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Execute the callback synchronously — matches the real Prisma $transaction behaviour
  // for our test setup (no nested transactions needed).
  vi.mocked(prisma.$transaction).mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
});

// ─────────────────────────────────────────────
// list
// ─────────────────────────────────────────────
describe("reportTemplate.list", () => {
  it("returns templates scoped to the caller's tenant", async () => {
    vi.mocked(prisma.reportTemplate.findMany).mockResolvedValue([STUB_TEMPLATE] as never);
    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(vi.mocked(prisma.reportTemplate.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) }),
    );
  });

  it("supports cursor-based pagination and returns nextCursor when more rows exist", async () => {
    vi.mocked(prisma.reportTemplate.findMany).mockResolvedValue([
      { ...STUB_TEMPLATE, id: "tmpl-2" },
      { ...STUB_TEMPLATE, id: "tmpl-3" },
    ] as never);
    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 1, cursor: "tmpl-1" });

    expect(result.nextCursor).toBe("tmpl-3");
    expect(result.items).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
// getById
// ─────────────────────────────────────────────
describe("reportTemplate.getById", () => {
  it("returns the template when it belongs to the caller's tenant", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(STUB_TEMPLATE);
    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: "tmpl-1" });

    expect(result.id).toBe("tmpl-1");
    expect(vi.mocked(prisma.reportTemplate.findFirst)).toHaveBeenCalledWith(
      partial({ where: { id: "tmpl-1", tenantId: TENANT_ID } }),
    );
  });

  it("throws NOT_FOUND when the template belongs to a different tenant (cross-tenant denied)", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx(OTHER_TENANT_ID));
    await expect(caller.getById({ id: "tmpl-1" })).rejects.toThrow(TRPCError);
  });
});

// ─────────────────────────────────────────────
// create
// ─────────────────────────────────────────────
describe("reportTemplate.create", () => {
  it("rejects a non-admin (operator) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(
      caller.create({
        name: "New Template",
        layout: "portrait-one-per-page",
        reportTitle: "Test",
        isDefault: false,
      }),
    ).rejects.toThrow(TRPCError);
  });

  // administrator: Settings mutations are gated to superAdminProcedure
  // (super_admin ONLY) — administrator is rejected.
  it("rejects administrator with FORBIDDEN (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_admin"]));
    await expect(
      caller.create({
        name: "New Template",
        layout: "portrait-one-per-page",
        reportTitle: "Test",
        isDefault: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // site_admin (tightened 2026-07-07): Settings is now super_admin ONLY —
  // site_admin was removed from superAdminProcedure.
  it("rejects site_admin with FORBIDDEN (Settings tightened to super_admin 2026-07-07)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await expect(
      caller.create({
        name: "New Template",
        layout: "portrait-one-per-page",
        reportTitle: "Test",
        isDefault: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates a template and writes an audit log entry", async () => {
    vi.mocked(prisma.reportTemplate.create).mockResolvedValue(STUB_TEMPLATE);

    const caller = createCaller(makeCtx());
    await caller.create({
      name: "Standard Report",
      layout: "portrait-one-per-page",
      reportTitle: "Marine Guardian Report",
      isDefault: false,
    });

    expect(vi.mocked(prisma.reportTemplate.create)).toHaveBeenCalledWith(
      partial({ data: partial({ tenantId: TENANT_ID, name: "Standard Report" }) }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({
        tenantId: TENANT_ID,
        action: "CREATE_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
      }),
    );
  });

  it("unsets sibling defaults inside the transaction when isDefault=true", async () => {
    vi.mocked(prisma.reportTemplate.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.reportTemplate.create).mockResolvedValue({
      ...STUB_TEMPLATE,
      isDefault: true,
    });

    const caller = createCaller(makeCtx());
    await caller.create({
      name: "Default Template",
      layout: "portrait-one-per-page",
      reportTitle: "Marine Guardian Report",
      isDefault: true,
    });

    expect(vi.mocked(prisma.reportTemplate.updateMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, isDefault: true }), data: { isDefault: false } }),
    );
  });

  it("uploads logo image and persists the returned key when partnerLogoUpload is provided", async () => {
    vi.mocked(prisma.reportTemplate.create).mockResolvedValue(STUB_TEMPLATE);
    vi.mocked(uploadImage).mockResolvedValue({ key: "logos/tenant-abc/tmpl-1-partner.png" });
    vi.mocked(prisma.reportTemplate.update).mockResolvedValue({
      ...STUB_TEMPLATE,
      partnerLogoKey: "logos/tenant-abc/tmpl-1-partner.png",
    });

    const caller = createCaller(makeCtx());
    const result = await caller.create({
      name: "Logo Template",
      layout: "portrait-one-per-page",
      reportTitle: "Branded Report",
      isDefault: false,
      partnerLogoUpload: {
        data: Buffer.from("fake-png-bytes").toString("base64"),
        contentType: "image/png",
      },
    });

    expect(vi.mocked(uploadImage)).toHaveBeenCalledWith(
      partial({ contentType: "image/png" }),
    );
    expect(result.partnerLogoKey).toBe("logos/tenant-abc/tmpl-1-partner.png");
  });
});

// ─────────────────────────────────────────────
// update
// ─────────────────────────────────────────────
describe("reportTemplate.update", () => {
  it("rejects a non-admin (field_coordinator) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(caller.update({ id: "tmpl-1", name: "Updated" })).rejects.toThrow(TRPCError);
  });

  it("rejects administrator with FORBIDDEN (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_admin"]));
    await expect(caller.update({ id: "tmpl-1", name: "Updated" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when template belongs to a different tenant (cross-tenant denied)", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx(OTHER_TENANT_ID));
    await expect(caller.update({ id: "tmpl-1", name: "Hack" })).rejects.toThrow(TRPCError);
  });

  it("updates the template and writes an audit log entry", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(STUB_TEMPLATE);
    vi.mocked(prisma.reportTemplate.update).mockResolvedValue({
      ...STUB_TEMPLATE,
      name: "Updated Name",
    });

    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "tmpl-1", name: "Updated Name" });

    expect(result.name).toBe("Updated Name");
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({
        tenantId: TENANT_ID,
        action: "UPDATE_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
        entityId: "tmpl-1",
      }),
    );
  });
});

// ─────────────────────────────────────────────
// delete
// ─────────────────────────────────────────────
describe("reportTemplate.delete", () => {
  it("rejects a non-admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.delete({ id: "tmpl-1" })).rejects.toThrow(TRPCError);
  });

  it("rejects administrator with FORBIDDEN (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_admin"]));
    await expect(caller.delete({ id: "tmpl-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when template belongs to a different tenant (cross-tenant denied)", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx(OTHER_TENANT_ID));
    await expect(caller.delete({ id: "tmpl-1" })).rejects.toThrow(TRPCError);
  });

  it("deletes the template and writes an audit log entry (delete audited)", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(STUB_TEMPLATE);
    vi.mocked(prisma.reportTemplate.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.delete({ id: "tmpl-1" });

    expect(result.deleted).toBe(true);
    expect(vi.mocked(prisma.reportTemplate.deleteMany)).toHaveBeenCalledWith(
      partial({ where: { id: "tmpl-1", tenantId: TENANT_ID } }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({
        tenantId: TENANT_ID,
        action: "DELETE_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
        entityId: "tmpl-1",
        severity: "info",
      }),
    );
  });
});

// ─────────────────────────────────────────────
// setDefault
// ─────────────────────────────────────────────
describe("reportTemplate.setDefault", () => {
  it("rejects a non-admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.setDefault({ id: "tmpl-1" })).rejects.toThrow(TRPCError);
  });

  it("rejects administrator with FORBIDDEN (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_admin"]));
    await expect(caller.setDefault({ id: "tmpl-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when template belongs to a different tenant (cross-tenant denied)", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx(OTHER_TENANT_ID));
    await expect(caller.setDefault({ id: "tmpl-1" })).rejects.toThrow(TRPCError);
  });

  it("unsets all other tenant defaults and sets the target template as default", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(STUB_TEMPLATE);
    vi.mocked(prisma.reportTemplate.updateMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.reportTemplate.update).mockResolvedValue({
      ...STUB_TEMPLATE,
      isDefault: true,
    });

    const caller = createCaller(makeCtx());
    const result = await caller.setDefault({ id: "tmpl-1" });

    // Siblings should be unset
    expect(vi.mocked(prisma.reportTemplate.updateMany)).toHaveBeenCalledWith(
      partial({
        where: partial({
          tenantId: TENANT_ID,
          isDefault: true,
          id: { not: "tmpl-1" },
        }),
        data: { isDefault: false },
      }),
    );
    // Target should be set to default
    expect(vi.mocked(prisma.reportTemplate.update)).toHaveBeenCalledWith(
      partial({ where: { id: "tmpl-1" }, data: { isDefault: true } }),
    );
    expect(result.isDefault).toBe(true);
  });

  it("writes an audit log entry for setDefault", async () => {
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(STUB_TEMPLATE);
    vi.mocked(prisma.reportTemplate.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.reportTemplate.update).mockResolvedValue({
      ...STUB_TEMPLATE,
      isDefault: true,
    });

    const caller = createCaller(makeCtx());
    await caller.setDefault({ id: "tmpl-1" });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({
        tenantId: TENANT_ID,
        action: "SET_DEFAULT_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
        entityId: "tmpl-1",
      }),
    );
  });
});
