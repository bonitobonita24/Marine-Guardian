import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    reportExport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    // Report Summary column (2026-07 harden pass) — reportExport.list
    // batch-resolves these ids to names. Default to empty so existing tests
    // that don't populate paramsJson ids never trigger a lookup.
    municipality: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    protectedZone: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    reportTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    areaBoundary: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@marine-guardian/jobs", () => ({
  enqueuePdfRender: vi.fn(),
  cancelPdfRender: vi.fn(),
  enqueuePptxRender: vi.fn(),
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
import {
  cancelPdfRender,
  enqueuePdfRender,
  enqueuePptxRender,
} from "@marine-guardian/jobs";
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
    impersonationTenantId: null,
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

  // viewer (2026-07-06): list is tenantProcedure (any authenticated tenant
  // user), unchanged by the reportGenerateProcedure widening on `create` —
  // a viewer must be able to retrieve exports it generated. Still strictly
  // tenant-scoped, same as every other role.
  it("allows a viewer to list exports, scoped to its own tenant only", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([
      { id: "re-1", tenantId: TENANT_ID, status: "ready" },
    ] as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(vi.mocked(prisma.reportExport.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
      })
    );
  });
});

describe("reportExport.list — reportSummary enrichment (Report Summary column)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves municipalityId + protectedZoneId + templateId to names for report_map rows, tenant-scoped", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([
      {
        id: "re-map-1",
        tenantId: TENANT_ID,
        reportType: "report_map",
        status: "ready",
        paramsJson: {
          templateId: "tpl-1",
          municipalityId: "muni-1",
          protectedZoneId: "zone-1",
          from: "2024-12-31T00:00:00.000Z",
          to: "2026-07-05T00:00:00.000Z",
        },
      },
    ] as never);
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1", name: "Calapan City" },
    ] as never);
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([
      { id: "zone-1", name: "Apo Reef" },
    ] as never);
    vi.mocked(prisma.reportTemplate.findMany).mockResolvedValue([
      { id: "tpl-1", name: "Standard" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.reportSummary).toEqual({
      municipalityName: "Calapan City",
      protectedZoneName: "Apo Reef",
      templateName: "Standard",
      areaName: null,
      from: "2024-12-31T00:00:00.000Z",
      to: "2026-07-05T00:00:00.000Z",
      period: null,
    });

    // Every lookup is tenant-scoped — never leaks a cross-tenant name.
    expect(vi.mocked(prisma.municipality.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, id: { in: ["muni-1"] } }) }),
    );
    expect(vi.mocked(prisma.protectedZone.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, id: { in: ["zone-1"] } }) }),
    );
    expect(vi.mocked(prisma.reportTemplate.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, id: { in: ["tpl-1"] } }) }),
    );
  });

  it("resolves areaBoundaryId to name for area report rows", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([
      {
        id: "re-area-1",
        tenantId: TENANT_ID,
        reportType: "area",
        status: "ready",
        paramsJson: {
          areaBoundaryId: "area-1",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
        },
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValue([
      { id: "area-1", name: "Bulalacao Coastal Zone" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]?.reportSummary).toEqual({
      municipalityName: null,
      protectedZoneName: null,
      templateName: null,
      areaName: "Bulalacao Coastal Zone",
      from: "2026-01-01",
      to: "2026-01-31",
      period: null,
    });
  });

  it("surfaces a null-filled reportSummary (no DB lookups) when paramsJson carries no known ids — coverage period fields pass through", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([
      {
        id: "re-cov-1",
        tenantId: TENANT_ID,
        reportType: "coverage",
        status: "ready",
        paramsJson: { category: "monthly", year: 2026, month: 6 },
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]?.reportSummary).toEqual({
      municipalityName: null,
      protectedZoneName: null,
      templateName: null,
      areaName: null,
      from: null,
      to: null,
      period: { year: 2026, month: 6 },
    });
    expect(vi.mocked(prisma.municipality.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.protectedZone.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reportTemplate.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.areaBoundary.findMany)).not.toHaveBeenCalled();
  });

  it("batches distinct ids across multiple rows into a single findMany call per model (no N+1)", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([
      {
        id: "re-a",
        tenantId: TENANT_ID,
        reportType: "report_map",
        status: "ready",
        paramsJson: { municipalityId: "muni-1" },
      },
      {
        id: "re-b",
        tenantId: TENANT_ID,
        reportType: "report_map",
        status: "ready",
        paramsJson: { municipalityId: "muni-2" },
      },
      {
        id: "re-c",
        tenantId: TENANT_ID,
        reportType: "report_map",
        status: "ready",
        // Same municipalityId as re-a — must be deduped, not fetched twice.
        paramsJson: { municipalityId: "muni-1" },
      },
    ] as never);
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1", name: "Calapan City" },
      { id: "muni-2", name: "Puerto Galera" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(vi.mocked(prisma.municipality.findMany)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.municipality.findMany).mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
    };
    expect(new Set(call.where.id.in)).toEqual(new Set(["muni-1", "muni-2"]));
    expect(result.items.map((i) => i.reportSummary.municipalityName)).toEqual([
      "Calapan City",
      "Puerto Galera",
      "Calapan City",
    ]);
  });

  it("municipalityId set but unresolved (no matching row) resolves to null, not a crash", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([
      {
        id: "re-orphan",
        tenantId: TENANT_ID,
        reportType: "report_map",
        status: "ready",
        paramsJson: { municipalityId: "muni-deleted" },
      },
    ] as never);
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]?.reportSummary.municipalityName).toBeNull();
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

  // viewer (2026-07-06): getById is tenantProcedure, unchanged by the
  // reportGenerateProcedure widening — a viewer can retrieve its own
  // tenant's export, and a cross-tenant id still resolves to null/NOT_FOUND
  // exactly like any other role (no leak introduced).
  it("allows a viewer to getById its own tenant's export, and still returns null cross-tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValueOnce({
      id: "re-1",
      tenantId: TENANT_ID,
      status: "ready",
    } as never);
    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));
    const owned = await caller.getById({ id: "re-1" });
    expect(owned?.id).toBe("re-1");

    vi.mocked(prisma.reportExport.findFirst).mockResolvedValueOnce(null);
    const crossTenant = await caller.getById({ id: "re-other" });
    expect(crossTenant).toBeNull();
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
    expect(vi.mocked(prisma.reportExport.create)).toHaveBeenCalledWith(
      partial({
        // telegramFileId is a server-side storage locator — never returned.
        omit: { telegramFileId: true, pptxTelegramFileId: true },
        data: partial<{
          tenantId: string;
          requestedByUserId: string;
          status: string;
        }>({
          tenantId: TENANT_ID,
          requestedByUserId: USER_ID,
          status: "queued",
        }),
      })
    );
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

  // viewer role (2026-07-06) — reportExport.create now runs
  // reportGenerateProcedure (rbac.ts), which allows viewer IN ADDITION to
  // coordinator+, so a viewer CAN generate a printable report from the
  // Interactive Report Map ("Generate Printable" button, no longer hidden
  // for viewer sessions). This is a narrow, deliberate exception — viewer
  // remains rejected by every other mutation in this router (see the
  // adminProcedure-gated retry/cancel/delete/renderPptx describe blocks
  // below).
  it("allows create when role is viewer (viewer can generate printable reports)", async () => {
    vi.mocked(prisma.reportExport.create).mockResolvedValue({
      id: "re-viewer",
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));
    const result = await caller.create({
      reportType: "report_map",
      paramsJson: {},
      paperSize: "A4",
    });

    expect(result.id).toBe("re-viewer");
    expect(vi.mocked(prisma.reportExport.create)).toHaveBeenCalledWith(
      partial({
        data: partial<{ tenantId: string; requestedByUserId: string }>({
          tenantId: TENANT_ID,
          requestedByUserId: USER_ID,
        }),
      })
    );
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

  it("does not fail the mutation when enqueue rejects (Valkey unreachable) — row stays queued, audit still written", async () => {
    // Regression — Generate Report 524. If the BullMQ enqueue throws (e.g.
    // bounded EnqueueTimeoutError because Valkey is down), create must still
    // return the queued row (recoverable via the retry button) rather than
    // hang or surface a 500.
    vi.mocked(prisma.reportExport.create).mockResolvedValue({
      id: "re-enqueue-fail",
      tenantId: TENANT_ID,
      requestedByUserId: USER_ID,
      status: "queued",
    } as never);
    vi.mocked(enqueuePdfRender).mockRejectedValueOnce(
      new Error("enqueuePdfRender timed out after 5000ms (Valkey/Redis unreachable?)")
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    const result = await caller.create({
      reportType: "coverage",
      paramsJson: {},
      paperSize: "A4",
    });

    expect(result.id).toBe("re-enqueue-fail");
    // Audit log is still written after a failed enqueue.
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
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

    // 5.3c — URL shape switched to /api/exports/reports/{id}/download.
    // Tenant scope enforced server-side at the Route Handler boundary
    // via session.tenantId; URL no longer carries tenantId.
    expect(result.downloadUrl).toBe(`/api/exports/reports/re-1/download`);
    expect(result.status).toBe("ready");
  });

  // viewer (2026-07-06): getDownloadUrl is tenantProcedure, unchanged by
  // the reportGenerateProcedure widening — a viewer must be able to
  // retrieve the download URL for a report it (or a coordinator) generated.
  it("allows a viewer to retrieve its own tenant's download URL", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      status: "ready",
      filePath: "/exports/re-1.pdf",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));
    const result = await caller.getDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBe(`/api/exports/reports/re-1/download`);
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

  it("returns the download URL for a Telegram-only row (telegramFileId set, filePath null) WITHOUT leaking the file_id", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-tg",
      status: "ready",
      filePath: null,
      telegramFileId: "BQACAgUAAxkDAAII",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-tg" });

    expect(result.downloadUrl).toBe(`/api/exports/reports/re-tg/download`);
    expect(result.status).toBe("ready");
    // The Telegram file_id must never cross the tRPC boundary.
    expect(JSON.stringify(result)).not.toContain("BQACAgUAAxkDAAII");
    expect(result).not.toHaveProperty("telegramFileId");
  });

  it("returns null downloadUrl when ready but NO storage location exists (both filePath and telegramFileId null)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-empty",
      status: "ready",
      filePath: null,
      telegramFileId: null,
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-empty" });

    expect(result.downloadUrl).toBeNull();
  });
});

describe("reportExport telegramFileId non-exposure (Phase 4 S1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list omits telegramFileId AND pptxTelegramFileId from the query result", async () => {
    vi.mocked(prisma.reportExport.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });

    expect(vi.mocked(prisma.reportExport.findMany)).toHaveBeenCalledWith(
      partial({
        omit: { telegramFileId: true, pptxTelegramFileId: true },
      })
    );
  });

  it("getById omits telegramFileId AND pptxTelegramFileId from the query result", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await caller.getById({ id: "re-1" });

    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({
        omit: { telegramFileId: true, pptxTelegramFileId: true },
      })
    );
  });
});

describe("reportExport.retry (5.3d)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects retry when role is operator (adminProcedure — site_admin+)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(caller.retry({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.findFirst)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePdfRender)).not.toHaveBeenCalled();
  });

  it("rejects retry when role is field_coordinator (adminProcedure gate)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));

    await expect(caller.retry({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePdfRender)).not.toHaveBeenCalled();
  });

  // viewer (2026-07-06): the reportGenerateProcedure exception is scoped to
  // `create` ONLY — retry stays adminProcedure, so a viewer that can now
  // generate a report still cannot retry a failed one.
  it("rejects retry when role is viewer (viewer widening is scoped to create only)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));

    await expect(caller.retry({ id: "re-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePdfRender)).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the row does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(caller.retry({ id: "re-other" })).rejects.toThrow(TRPCError);

    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePdfRender)).not.toHaveBeenCalled();
  });

  it("admin happy path: resets row state to queued + nullifies filePath/fileSizeBytes/errorMessage/completedAt", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed-1",
      tenantId: TENANT_ID,
      status: "failed",
      filePath: null,
      fileSizeBytes: null,
      errorMessage: "Puppeteer timeout",
      completedAt: new Date("2026-05-21T10:00:00Z"),
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-failed-1",
      tenantId: TENANT_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.retry({ id: "re-failed-1" });

    expect(result.id).toBe("re-failed-1");
    expect(vi.mocked(prisma.reportExport.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.reportExport.update)).toHaveBeenCalledWith({
      where: { id: "re-failed-1" },
      omit: { telegramFileId: true, pptxTelegramFileId: true },
      data: {
        status: "queued",
        filePath: null,
        telegramFileId: null,
        fileSizeBytes: null,
        errorMessage: null,
        completedAt: null,
      },
    });
  });

  it("admin happy path: re-enqueues pdf-render with the exportId + tenantId + userId", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed-2",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-failed-2",
      tenantId: TENANT_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.retry({ id: "re-failed-2" });

    expect(vi.mocked(enqueuePdfRender)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueuePdfRender)).toHaveBeenCalledWith({
      exportId: "re-failed-2",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
  });

  it("admin happy path: writes EXPORT_RETRY AuditLog with the row id as entityId", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed-3",
      tenantId: TENANT_ID,
      status: "failed",
      errorMessage: "renderer crashed",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-failed-3",
      tenantId: TENANT_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.retry({ id: "re-failed-3" });

    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: partial<{
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
      }>({
        action: "EXPORT_RETRY",
        userId: USER_ID,
        tenantId: TENANT_ID,
        entityType: "ReportExport",
        entityId: "re-failed-3",
      }),
    });
  });

  it("invokes findFirst BEFORE update BEFORE enqueuePdfRender BEFORE auditLog.create", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-order",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-order",
      tenantId: TENANT_ID,
      status: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.retry({ id: "re-order" });

    const findOrder = vi.mocked(prisma.reportExport.findFirst).mock
      .invocationCallOrder[0];
    const updateOrder = vi.mocked(prisma.reportExport.update).mock
      .invocationCallOrder[0];
    const enqueueOrder = vi.mocked(enqueuePdfRender).mock.invocationCallOrder[0];
    const auditOrder = vi.mocked(prisma.auditLog.create).mock
      .invocationCallOrder[0];

    expect(findOrder).toBeDefined();
    expect(updateOrder).toBeDefined();
    expect(enqueueOrder).toBeDefined();
    expect(auditOrder).toBeDefined();
    expect(findOrder).toBeLessThan(updateOrder as number);
    expect(updateOrder).toBeLessThan(enqueueOrder as number);
    expect(enqueueOrder).toBeLessThan(auditOrder as number);
  });
});

describe("reportExport.cancel (Stop button — escape hatch for stuck queued/rendering rows)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects cancel when role is operator (adminProcedure — site_admin+)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(caller.cancel({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.findFirst)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(cancelPdfRender)).not.toHaveBeenCalled();
  });

  it("rejects cancel when role is field_coordinator (adminProcedure gate)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));

    await expect(caller.cancel({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(cancelPdfRender)).not.toHaveBeenCalled();
  });

  // viewer (2026-07-06): reportGenerateProcedure only widens `create` —
  // cancel stays adminProcedure.
  it("rejects cancel when role is viewer (viewer widening is scoped to create only)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));

    await expect(caller.cancel({ id: "re-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(cancelPdfRender)).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the row does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(caller.cancel({ id: "re-other" })).rejects.toThrow(TRPCError);

    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
    expect(vi.mocked(cancelPdfRender)).not.toHaveBeenCalled();
  });

  it("admin happy path: sets a queued row to status=failed with errorMessage 'Cancelled by user' + completedAt", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-queued-1",
      tenantId: TENANT_ID,
      status: "queued",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-queued-1",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.cancel({ id: "re-queued-1" });

    expect(result.id).toBe("re-queued-1");
    expect(vi.mocked(prisma.reportExport.update)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.reportExport.update).mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; errorMessage: string; completedAt: Date };
    };
    expect(call.where).toEqual({ id: "re-queued-1" });
    expect(call.data.status).toBe("failed");
    expect(call.data.errorMessage).toBe("Cancelled by user");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("admin happy path: also works on a RENDERING row (not just queued)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-rendering-1",
      tenantId: TENANT_ID,
      status: "rendering",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-rendering-1",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.cancel({ id: "re-rendering-1" });

    expect(result.id).toBe("re-rendering-1");
    expect(vi.mocked(prisma.reportExport.update)).toHaveBeenCalledWith(
      partial({
        data: partial<{ status: string }>({ status: "failed" }),
      }),
    );
  });

  it("removes the BullMQ job for the exportId via cancelPdfRender", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-queued-2",
      tenantId: TENANT_ID,
      status: "queued",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-queued-2",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.cancel({ id: "re-queued-2" });

    expect(vi.mocked(cancelPdfRender)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cancelPdfRender)).toHaveBeenCalledWith("re-queued-2");
  });

  it("writes an EXPORT_CANCELLED AuditLog with the row id as entityId + previousStatus", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-queued-3",
      tenantId: TENANT_ID,
      status: "rendering",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-queued-3",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.cancel({ id: "re-queued-3" });

    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: partial<{
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
        changesJson: { previousStatus: string };
      }>({
        action: "EXPORT_CANCELLED",
        userId: USER_ID,
        tenantId: TENANT_ID,
        entityType: "ReportExport",
        entityId: "re-queued-3",
        changesJson: { previousStatus: "rendering" },
      }),
    });
  });

  it("still marks the row failed even when cancelPdfRender rejects (best-effort queue cleanup never blocks the DB write)", async () => {
    // cancelPdfRender itself never throws in real usage (it swallows its own
    // errors — see pdf-render.queue.ts), but this guards the router against
    // a future regression where the mock/implementation does reject.
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-queued-4",
      tenantId: TENANT_ID,
      status: "queued",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-queued-4",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);
    vi.mocked(cancelPdfRender).mockResolvedValueOnce(undefined);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.cancel({ id: "re-queued-4" });

    expect(result.id).toBe("re-queued-4");
  });
});

describe("reportExport.delete (Delete button — remove a terminal ready/failed row)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects delete when role is operator (adminProcedure — site_admin+)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(caller.delete({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.findFirst)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reportExport.delete)).not.toHaveBeenCalled();
  });

  it("rejects delete when role is field_coordinator (adminProcedure gate)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));

    await expect(caller.delete({ id: "re-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vi.mocked(prisma.reportExport.delete)).not.toHaveBeenCalled();
  });

  // viewer (2026-07-06): reportGenerateProcedure only widens `create` —
  // delete stays adminProcedure. A viewer that can generate a report must
  // NOT be able to delete any export.
  it("rejects delete when role is viewer (viewer widening is scoped to create only)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));

    await expect(caller.delete({ id: "re-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vi.mocked(prisma.reportExport.delete)).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the row does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(caller.delete({ id: "re-other" })).rejects.toThrow(TRPCError);

    expect(vi.mocked(prisma.reportExport.delete)).not.toHaveBeenCalled();
  });

  it("admin happy path: deletes a FAILED row by id, tenant-scoped", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed-del-1",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);
    vi.mocked(prisma.reportExport.delete).mockResolvedValue({
      id: "re-failed-del-1",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.delete({ id: "re-failed-del-1" });

    expect(result).toEqual({ id: "re-failed-del-1" });
    expect(vi.mocked(prisma.reportExport.delete)).toHaveBeenCalledWith({
      where: { id: "re-failed-del-1" },
    });
  });

  it("admin happy path: also deletes a READY row (terminal, not just failed)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-ready-del-1",
      tenantId: TENANT_ID,
      status: "ready",
    } as never);
    vi.mocked(prisma.reportExport.delete).mockResolvedValue({
      id: "re-ready-del-1",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.delete({ id: "re-ready-del-1" });

    expect(result).toEqual({ id: "re-ready-del-1" });
  });

  it("best-effort clears any lingering BullMQ job for the id via cancelPdfRender", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed-del-2",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);
    vi.mocked(prisma.reportExport.delete).mockResolvedValue({
      id: "re-failed-del-2",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.delete({ id: "re-failed-del-2" });

    expect(vi.mocked(cancelPdfRender)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cancelPdfRender)).toHaveBeenCalledWith("re-failed-del-2");
  });

  it("writes an EXPORT_DELETED AuditLog with the row id as entityId + previousStatus", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed-del-3",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);
    vi.mocked(prisma.reportExport.delete).mockResolvedValue({
      id: "re-failed-del-3",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.delete({ id: "re-failed-del-3" });

    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: partial<{
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
        changesJson: { previousStatus: string };
      }>({
        action: "EXPORT_DELETED",
        userId: USER_ID,
        tenantId: TENANT_ID,
        entityType: "ReportExport",
        entityId: "re-failed-del-3",
        changesJson: { previousStatus: "failed" },
      }),
    });
  });

  it("invokes findFirst BEFORE delete BEFORE auditLog.create", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-order-del",
      tenantId: TENANT_ID,
      status: "failed",
    } as never);
    vi.mocked(prisma.reportExport.delete).mockResolvedValue({
      id: "re-order-del",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.delete({ id: "re-order-del" });

    const findOrder = vi.mocked(prisma.reportExport.findFirst).mock
      .invocationCallOrder[0];
    const deleteOrder = vi.mocked(prisma.reportExport.delete).mock
      .invocationCallOrder[0];
    const auditOrder = vi.mocked(prisma.auditLog.create).mock
      .invocationCallOrder[0];

    expect(findOrder).toBeDefined();
    expect(deleteOrder).toBeDefined();
    expect(auditOrder).toBeDefined();
    expect(findOrder).toBeLessThan(deleteOrder as number);
    expect(deleteOrder).toBeLessThan(auditOrder as number);
  });
});

describe("reportExport.renderPptx (on-demand PDF→PowerPoint)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects renderPptx when role is operator (adminProcedure — site_admin+)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(caller.renderPptx({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.findFirst)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
  });

  it("rejects renderPptx when role is field_coordinator (adminProcedure gate — more restrictive than the coordinatorProcedure gating PDF create)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));

    await expect(caller.renderPptx({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
  });

  // viewer (2026-07-06): reportGenerateProcedure only widens the PDF
  // `create` — renderPptx stays adminProcedure.
  it("rejects renderPptx when role is viewer (viewer widening is scoped to create only)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));

    await expect(caller.renderPptx({ id: "re-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the row does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(caller.renderPptx({ id: "re-other" })).rejects.toThrow(
      TRPCError,
    );
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the PDF is not yet ready (queued/rendering)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-not-ready",
      status: "rendering",
      telegramFileId: null,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(
      caller.renderPptx({ id: "re-not-ready" }),
    ).rejects.toThrow(TRPCError);
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reportExport.update)).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the PDF is ready but has no telegramFileId (nothing to convert)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-no-file",
      status: "ready",
      telegramFileId: null,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(caller.renderPptx({ id: "re-no-file" })).rejects.toThrow(
      TRPCError,
    );
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
  });

  it("admin happy path: resets pptxStatus=queued + nullifies pptx fields, then enqueues pptx-render", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-ready-1",
      status: "ready",
      telegramFileId: "tg-pdf-file",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-ready-1",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.renderPptx({ id: "re-ready-1" });

    expect(result.id).toBe("re-ready-1");
    expect(vi.mocked(prisma.reportExport.update)).toHaveBeenCalledWith({
      where: { id: "re-ready-1" },
      omit: { telegramFileId: true, pptxTelegramFileId: true },
      data: {
        pptxStatus: "queued",
        pptxTelegramFileId: null,
        pptxFileSizeBytes: null,
        pptxErrorMessage: null,
      },
    });
    expect(vi.mocked(enqueuePptxRender)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueuePptxRender)).toHaveBeenCalledWith({
      exportId: "re-ready-1",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
  });

  it("admin happy path: writes EXPORT_PPTX_REQUESTED AuditLog with the row id as entityId", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-ready-2",
      status: "ready",
      telegramFileId: "tg-pdf-file",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-ready-2",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.renderPptx({ id: "re-ready-2" });

    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: partial<{
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
      }>({
        action: "EXPORT_PPTX_REQUESTED",
        userId: USER_ID,
        tenantId: TENANT_ID,
        entityType: "ReportExport",
        entityId: "re-ready-2",
      }),
    });
  });
});

describe("reportExport.pollPptxStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a slim payload scoped to tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      pptxStatus: "rendering",
      pptxErrorMessage: null,
      pptxFileSizeBytes: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.pollPptxStatus({ id: "re-1" });

    expect(result).toEqual(
      partial({ id: "re-1", pptxStatus: "rendering" }),
    );
    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({ where: partial({ id: "re-1", tenantId: TENANT_ID }) }),
    );
  });
});

describe("reportExport.getPptxDownloadUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NOT_FOUND when the export does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.getPptxDownloadUrl({ id: "re-missing" }),
    ).rejects.toThrow(TRPCError);
  });

  it("returns null downloadUrl when pptxStatus is not ready", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      pptxStatus: "rendering",
      pptxTelegramFileId: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getPptxDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBeNull();
  });

  it("returns null downloadUrl when pptxStatus is ready but pptxTelegramFileId is missing (defensive)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      pptxStatus: "ready",
      pptxTelegramFileId: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getPptxDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBeNull();
  });

  it("returns the canonical PPTX download URL when pptxStatus=ready, without leaking the file_id", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      pptxStatus: "ready",
      pptxTelegramFileId: "tg-pptx-file-abc",
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getPptxDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBe("/api/exports/reports/re-1/pptx");
    expect(JSON.stringify(result)).not.toContain("tg-pptx-file-abc");
  });
});
