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
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@marine-guardian/jobs", () => ({
  enqueuePdfRender: vi.fn(),
  cancelPdfRender: vi.fn(),
  enqueuePptxRender: vi.fn(),
}));

// Mocked at the REAL key shape (not a stub) so purge's key assertions pin
// the actual produced string — see packages/storage/src/index.ts.
vi.mock("@marine-guardian/storage", () => ({
  getExportsBucketName: vi.fn(() => "mg-exports"),
  deleteObject: vi.fn(),
  buildPptxExportKey: vi.fn(
    (tenantId: string, exportId: string, at: Date) =>
      `${tenantId}/${String(at.getUTCFullYear())}/${String(
        at.getUTCMonth() + 1,
      ).padStart(2, "0")}/${exportId}.pptx`,
  ),
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
import { deleteObject } from "@marine-guardian/storage";
import { createCallerFactory } from "../../trpc";
import { reportExportRouter } from "../reportExport";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(reportExportRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

/** The generic, client-safe replacement returned instead of raw error text. */
const GENERIC_EXPORT_ERROR = "Report generation failed. Please try again.";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["field_coordinator"]
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        tenantSlug: "",
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

describe("reportExport.pollStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a slim payload scoped to tenant", async () => {
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
    expect(result?.errorMessage).toBeNull();
    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({
        where: { id: "re-1", tenantId: TENANT_ID },
      })
    );
  });

  it("returns null when the row does not exist for this tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(caller.pollStatus({ id: "re-other" })).resolves.toBeNull();
  });

  // REGRESSION TEST for the reported leak: internal renderer text (file
  // paths, stack fragments) was visible in the network payload.
  it("replaces a failed row's raw errorMessage with the generic message and never serialises the internal text", async () => {
    const RAW =
      "Error: ENOENT /srv/app/.next/server/app/print-render/page.js at renderPdfViaService";
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed",
      status: "failed",
      completedAt: new Date("2026-07-20T00:00:00Z"),
      errorMessage: RAW,
      fileSizeBytes: null,
    } as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const caller = createCaller(makeCtx());
    const result = await caller.pollStatus({ id: "re-failed" });

    expect(result?.errorMessage).toBe(GENERIC_EXPORT_ERROR);
    expect(JSON.stringify(result)).not.toContain(RAW);
    expect(JSON.stringify(result)).not.toContain("/srv/app");
    expect(JSON.stringify(result)).not.toContain("ENOENT");
    errorSpy.mockRestore();
  });

  it("still logs the real errorMessage server-side so operators keep diagnostics", async () => {
    const RAW = "Error: renderer timed out after 120000ms";
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-failed-2",
      status: "failed",
      completedAt: null,
      errorMessage: RAW,
      fileSizeBytes: null,
    } as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const caller = createCaller(makeCtx());
    await caller.pollStatus({ id: "re-failed-2" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.join(" ")).toContain(RAW);
    expect(errorSpy.mock.calls[0]?.join(" ")).toContain("re-failed-2");
    errorSpy.mockRestore();
  });
});

describe("reportExport.create (RBAC + pipeline wiring)", () => {
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
        // Legacy Telegram columns are never returned.
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

  // viewer role (2026-07-06) — reportExport.create runs
  // reportGenerateProcedure (rbac.ts), which allows viewer IN ADDITION to
  // coordinator+, so a viewer CAN generate a printable report from the
  // Interactive Report Map.
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

  it("enqueues a pdf-render job with the created row's id + tenantId + userId", async () => {
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
    // return the queued row rather than hang or surface a 500.
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
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("writes an EXPORT_REQUESTED AuditLog with the new row's id as entityId", async () => {
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
      filePath: `${TENANT_ID}/2026/07/re-1.pdf`,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-1" });

    // Tenant scope is enforced server-side at the Route Handler boundary
    // via session.tenantId; the URL does not carry tenantId.
    expect(result.downloadUrl).toBe(`/api/exports/reports/re-1/download`);
    expect(result.status).toBe("ready");
  });

  it("allows a viewer to retrieve its own tenant's download URL", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      status: "ready",
      filePath: `${TENANT_ID}/2026/07/re-1.pdf`,
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
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBeNull();
    expect(result.status).toBe("rendering");
  });

  // Telegram is gone: filePath (the MinIO object key) is the ONLY storage
  // locator, so a ready row with no key has nothing to serve — e.g. it was
  // already purged by the janitor or by reportExport.purge.
  it("returns null downloadUrl when status=ready but filePath is null (purged / never stored)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-empty",
      status: "ready",
      filePath: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-empty" });

    expect(result.downloadUrl).toBeNull();
    expect(result.status).toBe("ready");
  });

  it("never returns the internal object key to the client", async () => {
    const KEY = `${TENANT_ID}/2026/07/re-key.pdf`;
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-key",
      status: "ready",
      filePath: KEY,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getDownloadUrl({ id: "re-key" });

    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(result).not.toHaveProperty("filePath");
  });

  it("throws NOT_FOUND when the export does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(caller.getDownloadUrl({ id: "re-other" })).rejects.toThrow(
      TRPCError
    );
  });
});

describe("reportExport.purge (best-effort dialog-close cleanup)", () => {
  beforeEach(() => vi.clearAllMocks());

  function row(id: string, createdAt = new Date("2026-07-15T12:00:00Z")) {
    return {
      id,
      tenantId: TENANT_ID,
      filePath: `${TENANT_ID}/2026/07/${id}.pdf`,
      createdAt,
    };
  }

  it("deletes the PDF object, the derived PPTX object and the row, returning the count", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(row("re-p1") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.purge({ ids: ["re-p1"] });

    expect(result).toEqual({ purged: 1 });
    expect(vi.mocked(deleteObject)).toHaveBeenCalledWith({
      bucket: "mg-exports",
      key: `${TENANT_ID}/2026/07/re-p1.pdf`,
    });
    expect(vi.mocked(deleteObject)).toHaveBeenCalledWith({
      bucket: "mg-exports",
      key: `${TENANT_ID}/2026/07/re-p1.pptx`,
    });
    expect(vi.mocked(prisma.reportExport.deleteMany)).toHaveBeenCalledWith({
      where: { id: "re-p1", tenantId: TENANT_ID },
    });
  });

  it("best-effort cancels any still-pending BullMQ render job", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(row("re-p2") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.purge({ ids: ["re-p2"] });

    expect(vi.mocked(cancelPdfRender)).toHaveBeenCalledWith("re-p2");
  });

  it("purges several ids in one call", async () => {
    vi.mocked(prisma.reportExport.findFirst)
      .mockResolvedValueOnce(row("re-a") as never)
      .mockResolvedValueOnce(row("re-b") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await expect(caller.purge({ ids: ["re-a", "re-b"] })).resolves.toEqual({
      purged: 2,
    });
  });

  // Tenant scope is enforced server-side: a hostile client's id simply
  // resolves to no row. No NOT_FOUND — that would leak existence and make a
  // normal double-close look like an error.
  it("silently skips an unknown / cross-tenant id and does NOT throw", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    const result = await caller.purge({ ids: ["re-other-tenant"] });

    expect(result).toEqual({ purged: 0 });
    expect(vi.mocked(deleteObject)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reportExport.deleteMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({ where: { id: "re-other-tenant", tenantId: TENANT_ID } }),
    );
  });

  it("scopes every lookup to the caller's tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(row("re-scope") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.purge({ ids: ["re-scope"] });

    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({ where: { id: "re-scope", tenantId: TENANT_ID } }),
    );
  });

  it("does not throw when deleteObject rejects, and still deletes the row", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(row("re-p3") as never);
    vi.mocked(deleteObject).mockRejectedValue(new Error("minio unreachable"));
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const caller = createCaller(makeCtx());
    await expect(caller.purge({ ids: ["re-p3"] })).resolves.toEqual({ purged: 1 });

    expect(vi.mocked(prisma.reportExport.deleteMany)).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not throw when the row lookup itself rejects — the remaining ids are still swept", async () => {
    vi.mocked(prisma.reportExport.findFirst)
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce(row("re-ok") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const caller = createCaller(makeCtx());
    await expect(caller.purge({ ids: ["re-bad", "re-ok"] })).resolves.toEqual({
      purged: 1,
    });
    warnSpy.mockRestore();
  });

  it("does not count a row whose delete rejects, and still does not throw", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(row("re-p4") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockRejectedValue(new Error("db down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const caller = createCaller(makeCtx());
    await expect(caller.purge({ ids: ["re-p4"] })).resolves.toEqual({ purged: 0 });
    warnSpy.mockRestore();
  });

  it("still deletes the derived PPTX object when filePath is null", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      ...row("re-p5"),
      filePath: null,
    } as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.purge({ ids: ["re-p5"] });

    expect(vi.mocked(deleteObject)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteObject)).toHaveBeenCalledWith({
      bucket: "mg-exports",
      key: `${TENANT_ID}/2026/07/re-p5.pptx`,
    });
  });

  // The PPTX key is derived and embeds the UPLOAD-time UTC year/month, so a
  // row created just before UTC midnight on the last day of a month has its
  // object under the NEXT month's prefix. Probe both candidates.
  it("probes both month prefixes for the derived PPTX key at a month boundary", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(
      row("re-edge", new Date("2026-07-31T23:59:00Z")) as never,
    );
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.purge({ ids: ["re-edge"] });

    const keys = vi.mocked(deleteObject).mock.calls.map((c) => c[0].key);
    expect(keys).toContain(`${TENANT_ID}/2026/07/re-edge.pptx`);
    expect(keys).toContain(`${TENANT_ID}/2026/08/re-edge.pptx`);
  });

  it("issues only ONE pptx delete mid-month (the two candidates dedupe)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(row("re-mid") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.purge({ ids: ["re-mid"] });

    const pptxKeys = vi
      .mocked(deleteObject)
      .mock.calls.map((c) => c[0].key)
      .filter((k) => k.endsWith(".pptx"));
    expect(pptxKeys).toEqual([`${TENANT_ID}/2026/07/re-mid.pptx`]);
  });

  it("allows a viewer to purge (anyone who can generate can clean up)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(row("re-v") as never);
    vi.mocked(prisma.reportExport.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));
    await expect(caller.purge({ ids: ["re-v"] })).resolves.toEqual({ purged: 1 });
  });

  it("rejects an empty id list and a list over the 20-id cap at the schema boundary", async () => {
    const caller = createCaller(makeCtx());
    await expect(caller.purge({ ids: [] })).rejects.toThrow(TRPCError);
    await expect(
      caller.purge({ ids: Array.from({ length: 21 }, (_, i) => `re-${String(i)}`) }),
    ).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.findFirst)).not.toHaveBeenCalled();
  });
});

describe("reportExport.renderPptx (on-demand PowerPoint render)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NOT_FOUND when the row does not exist for this tenant (no cross-tenant leak)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await expect(caller.renderPptx({ id: "re-other" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
  });

  it("rejects renderPptx when role is operator (still below reportGenerateProcedure)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(caller.renderPptx({ id: "re-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.reportExport.findFirst)).not.toHaveBeenCalled();
    expect(vi.mocked(enqueuePptxRender)).not.toHaveBeenCalled();
  });

  // Phase 4 S6 — DELIBERATE WIDENING from adminProcedure to
  // reportGenerateProcedure: the in-dialog "Generate PowerPoint" button is
  // offered to everyone who can generate a report, which includes viewer.
  it("allows renderPptx for a viewer (RBAC widened with the in-dialog PowerPoint button)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-viewer-pptx",
      status: "ready",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-viewer-pptx",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));
    const result = await caller.renderPptx({ id: "re-viewer-pptx" });

    expect(result.id).toBe("re-viewer-pptx");
    expect(vi.mocked(enqueuePptxRender)).toHaveBeenCalledTimes(1);
  });

  it("allows renderPptx for a field_coordinator", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-fc-pptx",
      status: "ready",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-fc-pptx",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(
      caller.renderPptx({ id: "re-fc-pptx" }),
    ).resolves.toEqual(partial({ id: "re-fc-pptx" }));
  });

  // The old precondition (PDF status must be "ready" AND telegramFileId
  // non-null) is DEAD: the pptx worker renders from live report data, and
  // telegramFileId is now always null — the guard would reject every request.
  it("succeeds on a row whose PDF status is 'failed' (dead precondition removed)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-pdf-failed",
      status: "failed",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-pdf-failed",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    const result = await caller.renderPptx({ id: "re-pdf-failed" });

    expect(result.id).toBe("re-pdf-failed");
    expect(vi.mocked(enqueuePptxRender)).toHaveBeenCalledWith({
      exportId: "re-pdf-failed",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
  });

  it("succeeds on a row whose PDF is still queued", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-pdf-queued",
      status: "queued",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-pdf-queued",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(
      caller.renderPptx({ id: "re-pdf-queued" }),
    ).resolves.toEqual(partial({ id: "re-pdf-queued" }));
  });

  it("resets pptxStatus=queued + nullifies prior pptx fields, then enqueues pptx-render", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-ready-1",
      status: "ready",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-ready-1",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await caller.renderPptx({ id: "re-ready-1" });

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
  });

  it("writes EXPORT_PPTX_REQUESTED AuditLog with the row id as entityId", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-ready-2",
      status: "ready",
    } as never);
    vi.mocked(prisma.reportExport.update).mockResolvedValue({
      id: "re-ready-2",
      pptxStatus: "queued",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
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

    expect(result).toEqual(partial({ id: "re-1", pptxStatus: "rendering" }));
    expect(result?.pptxErrorMessage).toBeNull();
    expect(vi.mocked(prisma.reportExport.findFirst)).toHaveBeenCalledWith(
      partial({ where: partial({ id: "re-1", tenantId: TENANT_ID }) }),
    );
  });

  it("returns null when the row does not exist for this tenant", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(caller.pollPptxStatus({ id: "re-other" })).resolves.toBeNull();
  });

  // Same regression guard as pollStatus: the raw pptx renderer error must
  // never reach the browser.
  it("replaces a failed row's raw pptxErrorMessage with the generic message", async () => {
    const RAW =
      "Error: EACCES /var/lib/minio/mg-exports/tenant-abc/2026/07/re-x.pptx";
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-pptx-failed",
      pptxStatus: "failed",
      pptxErrorMessage: RAW,
      pptxFileSizeBytes: null,
    } as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const caller = createCaller(makeCtx());
    const result = await caller.pollPptxStatus({ id: "re-pptx-failed" });

    expect(result?.pptxErrorMessage).toBe(GENERIC_EXPORT_ERROR);
    expect(JSON.stringify(result)).not.toContain(RAW);
    expect(JSON.stringify(result)).not.toContain("/var/lib/minio");
    // …but the operator still gets it in the server log.
    expect(errorSpy.mock.calls[0]?.join(" ")).toContain(RAW);
    errorSpy.mockRestore();
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
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getPptxDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBeNull();
  });

  it("returns null downloadUrl when pptxStatus is null (never requested)", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      pptxStatus: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getPptxDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBeNull();
  });

  // The pptx object key is DERIVED by the Route Handler, so pptxStatus is
  // the only row-level gate — there is no key column to check.
  it("returns the canonical PPTX download URL when pptxStatus=ready", async () => {
    vi.mocked(prisma.reportExport.findFirst).mockResolvedValue({
      id: "re-1",
      pptxStatus: "ready",
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getPptxDownloadUrl({ id: "re-1" });

    expect(result.downloadUrl).toBe("/api/exports/reports/re-1/pptx");
    expect(result.pptxStatus).toBe("ready");
  });
});
