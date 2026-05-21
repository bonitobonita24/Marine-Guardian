import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    reportExport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@marine-guardian/jobs", () => ({
  enqueuePdfRender: vi.fn(),
}));

vi.mock("../../../lib/rate-limit", () => ({
  rateLimiters: {
    public: { check: vi.fn() },
    api: { check: vi.fn() },
    auth: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@marine-guardian/db";
import { enqueuePdfRender } from "@marine-guardian/jobs";
import { createCallerFactory } from "../../trpc";
import { reportExportRouter } from "../reportExport";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(reportExportRouter);

const TENANT_ID = "tenant-abc";
const OTHER_TENANT_ID = "tenant-xyz";
const USER_ID = "user-123";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["field_coordinator"]
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        roles,
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
  };
}

describe("reportExport.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns exports scoped to current tenant only", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([
      { id: "re-1", tenantId: TENANT_ID, status: "ready" },
      { id: "re-2", tenantId: TENANT_ID, status: "queued" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(vi.mocked(prisma.reportExport.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
      })
    );
  });

  it("filters by status and reportType when provided", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, status: "ready", reportType: "coverage" });

    expect(vi.mocked(prisma.reportExport.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ status: string; reportType: string }>({
          status: "ready",
          reportType: "coverage",
        }),
      })
    );
  });
});

describe("reportExport.getById / pollStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the export when owned by current tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      tenantId: TENANT_ID,
      status: "ready",
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: "re-1" });

    expect(result?.id).toBe("re-1");
    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({
        where: { id: "re-1", tenantId: TENANT_ID },
      })
    );
  });

  it("returns null when export belongs to a different tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID));
    const result = await caller.getById({ id: "re-other" });

    expect(result).toBeNull();
    expect(vi.mocked(prisma.reportExport.findFirst)).not.toHaveBeenCalledWith(
      partial({
        where: { id: "re-other", tenantId: OTHER_TENANT_ID },
      })
    );
  });

  it("pollStatus returns slim payload scoped to tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      status: "rendering",
      completedAt: null,
      errorMessage: null,
      fileSizeBytes: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.pollStatus({ id: "re-1" });

    expect(result?.status).toBe("rendering");
    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({
        where: { id: "re-1", tenantId: TENANT_ID },
      })
    );
  });
});

describe("reportExport.create (RBAC + 5.3b pipeline wiring)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an export row with status=queued and proper tenant/user scoping (coordinator+)", async () => {
    vi.mocked(prisma.reportExport.create).mockResolvedValue({
      id: "re-new",
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    const result = await caller.create({
      reportType: "coverage",
      paramsJson: { dateRange: { start: "2026-05-01", end: "2026-05-31" } },
      paperSize: "A4",
    });

    expect(result.id).toBe("re-new");
    expect(vi.mocked(prisma.reportExport.create)).toHaveBeenCalledWith({
      data: partial<{
        tenantId: string;
        requestedByUserId: string;
        status: string;
      }>({
        tenantId: TENANT_ID,
        requestedByUserId: USER_ID,
        status: "queued",
      }),
    });
  });

  it("rejects create when role is operator (report.export requires coordinator+)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(
      caller.create({
        reportType: "coverage",
        paramsJson: {},
        paperSize: "A4",
      })
    ).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.create)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePdfRender)).not.toHaveBeenCalled();
  });

  it("enqueues a pdf-render job with the created row's id + tenantId + userId (5.3b wiring)", async () => {
    vi.mocked(prisma.reportExport.create).mockResolvedValue({
      id: "re-enqueue-1",
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await caller.create({
      reportType: "area",
      paramsJson: {},
      paperSize: "A4",
    });

    expect(vi.mocked(enqueuePdfRender)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueuePdfRender)).toHaveBeenCalledWith({
      exportId: "re-enqueue-1",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
  });

  it("writes an EXPORT_REQUESTED AuditLog with the new row's id as entityId (5.3b wiring)", async () => {
    vi.mocked(prisma.reportExport.create).mockResolvedValue({
      id: "re-audit-1",
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await caller.create({
      reportType: "coverage",
      paramsJson: { dateRange: { start: "2026-05-01", end: "2026-05-31" } },
      paperSize: "Letter",
    });

    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: partial<{
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
      }>({
        action: "EXPORT_REQUESTED",
        userId: USER_ID,
        tenantId: TENANT_ID,
        entityType: "ReportExport",
        entityId: "re-audit-1",
      }),
    });
  });

  it("invokes prisma.create BEFORE enqueuePdfRender BEFORE auditLog.create", async () => {
    vi.mocked(prisma.reportExport.create).mockResolvedValue({
      id: "re-order-1",
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await caller.create({
      reportType: "consolidated",
      paramsJson: {},
      paperSize: "A4",
    });

    const createOrder =
      vi.mocked(prisma.reportExport.create).mock.invocationCallOrder[0];
    const enqueueOrder = vi.mocked(enqueuePdfRender).mock.invocationCallOrder[0];
    const auditOrder = vi.mocked(prisma.auditLog.create).mock.invocationCallOrder[0];
    expect(createOrder).toBeDefined();
    expect(enqueueOrder).toBeDefined();
    expect(auditOrder).toBeDefined();
    expect(createOrder).toBeLessThan(enqueueOrder as number);
    expect(enqueueOrder).toBeLessThan(auditOrder as number);
  });
});

describe("reportExport.getDownloadUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the canonical download URL when status=ready and filePath is set", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      status: "ready",
      filePath: "/exports/re-1.pdf",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBe(`/${TENANT_ID}/exports/re-1/download`);
    expect(result.status).toBe("ready");
  });

  it("returns null downloadUrl when status is not ready", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      status: "rendering",
      filePath: null,
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBeNull();
    expect(result.status).toBe("rendering");
  });

  it("throws NOT_FOUND when the export does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(caller.getDownloadUrl({ id: "re-other" })).rejects.toThrow(
      TRPCError
    );
  });
});
