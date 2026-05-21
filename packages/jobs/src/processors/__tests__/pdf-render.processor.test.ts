// 5.3b — pdf-render processor tests.
//
// Verifies the BullMQ job handler:
//  (1) validates tenant context first,
//  (2) loads the ReportExport row + tenant slug via the platformPrisma cast,
//  (3) transitions status queued → rendering before invoking the renderer,
//  (4) constructs printUrl from WEB_APP_INTERNAL_URL + tenant.slug + row.reportType + row.id,
//  (5) calls renderPdfViaService with paperSize + landscape derived from the row,
//  (6) STUB storage path returned in 5.3b is shaped per spec
//      (marine-guardian-{env}-exports/{tenantId}/{year}/{month}/{exportId}.pdf)
//      — real MinIO upload lands in 5.3c, this batch returns a deterministic
//      string only,
//  (7) on success: status=ready + filePath + fileSizeBytes + completedAt
//      atomically + Returns RenderResult,
//  (8) on failure (transient): re-throws to trigger BullMQ retry — does NOT
//      flip status=failed until the LAST attempt (attemptsMade+1 == attempts),
//  (9) on final failure (last retry exhausted): status=failed + errorMessage
//      + re-throws.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { Job } from "bullmq";
import type { PdfRenderJobPayload } from "../../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

const mockReportExportFindFirstOrThrow = vi.fn();
const mockReportExportUpdate = vi.fn();
const mockTenantFindUniqueOrThrow = vi.fn();

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    reportExport: {
      findFirstOrThrow: (...args: unknown[]): unknown =>
        mockReportExportFindFirstOrThrow(...args),
      update: (...args: unknown[]): unknown => mockReportExportUpdate(...args),
    },
    tenant: {
      findUniqueOrThrow: (...args: unknown[]): unknown =>
        mockTenantFindUniqueOrThrow(...args),
    },
  },
}));

const mockRenderPdfViaService = vi.fn();
vi.mock("../../lib/pdf-renderer-client", () => ({
  renderPdfViaService: (...args: unknown[]): unknown =>
    mockRenderPdfViaService(...args),
  PdfRendererError: class PdfRendererError extends Error {
    readonly status: number | undefined;
    constructor(message: string, status?: number) {
      super(message);
      this.name = "PdfRendererError";
      this.status = status;
    }
  },
}));

import { processPdfRender } from "../pdf-render.processor";
import { validateTenantContext } from "../../workers/base-worker";

const mockValidate = validateTenantContext as ReturnType<typeof vi.fn>;

function makeJob(
  overrides: Partial<PdfRenderJobPayload> = {},
  jobOpts: { attemptsMade?: number; attempts?: number } = {},
): Job<PdfRenderJobPayload> {
  return {
    id: "test-job-1",
    data: {
      tenantId: "tenant-1",
      userId: "user-1",
      exportId: "export-1",
      ...overrides,
    },
    attemptsMade: jobOpts.attemptsMade ?? 0,
    opts: { attempts: jobOpts.attempts ?? 3 },
  } as unknown as Job<PdfRenderJobPayload>;
}

const fakePdfBuffer = Buffer.from("%PDF-1.4 fake pdf bytes for testing");

describe("processPdfRender", () => {
  const ORIGINAL_ENV = process.env.WEB_APP_INTERNAL_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_APP_INTERNAL_URL = "http://marine-guardian_test_app:3000";

    mockReportExportFindFirstOrThrow.mockResolvedValue({
      id: "export-1",
      tenantId: "tenant-1",
      reportType: "coverage",
      paperSize: "A4",
      status: "queued",
    });
    mockTenantFindUniqueOrThrow.mockResolvedValue({
      id: "tenant-1",
      slug: "marine-guardian-sample",
    });
    mockReportExportUpdate.mockResolvedValue({});
    mockRenderPdfViaService.mockResolvedValue(fakePdfBuffer);
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.WEB_APP_INTERNAL_URL;
    } else {
      process.env.WEB_APP_INTERNAL_URL = ORIGINAL_ENV;
    }
  });

  it("calls validateTenantContext with the job payload before any I/O", async () => {
    await processPdfRender(makeJob());
    expect(mockValidate).toHaveBeenCalledTimes(1);
    expect(mockValidate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      exportId: "export-1",
    });
    expect(mockValidate.mock.invocationCallOrder[0]).toBeLessThan(
      mockReportExportFindFirstOrThrow.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("loads ReportExport row scoped by exportId AND tenantId (no cross-tenant leak)", async () => {
    await processPdfRender(makeJob({ exportId: "export-99", tenantId: "tenant-x" }));
    expect(mockReportExportFindFirstOrThrow).toHaveBeenCalledTimes(1);
    const call = mockReportExportFindFirstOrThrow.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("export-99");
    expect(call.where.tenantId).toBe("tenant-x");
  });

  it("loads Tenant row by id to obtain slug for printUrl construction", async () => {
    await processPdfRender(makeJob());
    expect(mockTenantFindUniqueOrThrow).toHaveBeenCalledTimes(1);
    const call = mockTenantFindUniqueOrThrow.mock.calls[0]?.[0] as {
      where: { id: string };
    };
    expect(call.where.id).toBe("tenant-1");
  });

  it("transitions status queued → rendering BEFORE invoking the renderer", async () => {
    await processPdfRender(makeJob());
    const firstUpdateCall = mockReportExportUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string };
    };
    expect(firstUpdateCall.where.id).toBe("export-1");
    expect(firstUpdateCall.data.status).toBe("rendering");
    // Ordering check: rendering update fires before renderer call.
    expect(mockReportExportUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockRenderPdfViaService.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("constructs printUrl from WEB_APP_INTERNAL_URL + tenant.slug + reportType + exportId", async () => {
    mockTenantFindUniqueOrThrow.mockResolvedValueOnce({
      id: "tenant-1",
      slug: "acme-rangers",
    });
    mockReportExportFindFirstOrThrow.mockResolvedValueOnce({
      id: "export-42",
      tenantId: "tenant-1",
      reportType: "area",
      paperSize: "Letter",
      status: "queued",
    });

    await processPdfRender(makeJob({ exportId: "export-42" }));

    const rendererCall = mockRenderPdfViaService.mock.calls[0]?.[0] as {
      printUrl: string;
      paperSize: string;
      landscape: boolean;
      exportId: string;
    };
    expect(rendererCall.printUrl).toBe(
      "http://marine-guardian_test_app:3000/print-render/acme-rangers/area/export-42",
    );
    expect(rendererCall.paperSize).toBe("Letter");
    expect(rendererCall.exportId).toBe("export-42");
  });

  it("derives landscape=true for coverage report, landscape=false for others", async () => {
    // Coverage = landscape (per v2 spec — wide funder template)
    mockReportExportFindFirstOrThrow.mockResolvedValueOnce({
      id: "export-cov",
      tenantId: "tenant-1",
      reportType: "coverage",
      paperSize: "A4",
      status: "queued",
    });
    await processPdfRender(makeJob({ exportId: "export-cov" }));
    expect(
      (mockRenderPdfViaService.mock.calls[0]?.[0] as { landscape: boolean })
        .landscape,
    ).toBe(true);

    mockRenderPdfViaService.mockClear();
    mockReportExportFindFirstOrThrow.mockResolvedValueOnce({
      id: "export-area",
      tenantId: "tenant-1",
      reportType: "area",
      paperSize: "A4",
      status: "queued",
    });
    await processPdfRender(makeJob({ exportId: "export-area" }));
    expect(
      (mockRenderPdfViaService.mock.calls[0]?.[0] as { landscape: boolean })
        .landscape,
    ).toBe(false);
  });

  it("on success: updates status=ready + filePath + fileSizeBytes + completedAt", async () => {
    const result = await processPdfRender(makeJob());

    // Two updates: queued→rendering, then rendering→ready.
    expect(mockReportExportUpdate).toHaveBeenCalledTimes(2);
    const finalUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
      where: { id: string };
      data: {
        status: string;
        filePath: string;
        fileSizeBytes: number;
        completedAt: Date;
      };
    };
    expect(finalUpdate.where.id).toBe("export-1");
    expect(finalUpdate.data.status).toBe("ready");
    expect(finalUpdate.data.filePath).toMatch(
      /^marine-guardian-[a-z]+-exports\/tenant-1\/\d{4}\/\d{2}\/export-1\.pdf$/,
    );
    expect(finalUpdate.data.fileSizeBytes).toBe(fakePdfBuffer.length);
    expect(finalUpdate.data.completedAt).toBeInstanceOf(Date);
    expect(result.status).toBe("ready");
    expect(result.exportId).toBe("export-1");
    expect(result.filePath).toBe(finalUpdate.data.filePath);
  });

  it("on transient failure (NOT last attempt): re-throws WITHOUT flipping status=failed", async () => {
    mockRenderPdfViaService.mockRejectedValueOnce(
      new Error("pdf-renderer fetch failed: ECONNRESET"),
    );

    await expect(
      processPdfRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("ECONNRESET");

    // Only the queued→rendering update — no status=failed flip yet.
    const updates = mockReportExportUpdate.mock.calls.map(
      (c) => (c[0] as { data: { status?: string } }).data.status,
    );
    expect(updates).toEqual(["rendering"]);
    expect(updates).not.toContain("failed");
  });

  it("on final failure (last attempt exhausted): updates status=failed + errorMessage + re-throws", async () => {
    mockRenderPdfViaService.mockRejectedValueOnce(
      new Error("pdf-renderer returned non-OK status 500"),
    );

    await expect(
      processPdfRender(makeJob({}, { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow("status 500");

    expect(mockReportExportUpdate).toHaveBeenCalledTimes(2);
    const failedUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
      where: { id: string };
      data: { status: string; errorMessage: string; completedAt: Date };
    };
    expect(failedUpdate.where.id).toBe("export-1");
    expect(failedUpdate.data.status).toBe("failed");
    expect(failedUpdate.data.errorMessage).toContain("status 500");
    expect(failedUpdate.data.completedAt).toBeInstanceOf(Date);
  });

  it("throws early when WEB_APP_INTERNAL_URL is not configured", async () => {
    delete process.env.WEB_APP_INTERNAL_URL;
    await expect(processPdfRender(makeJob())).rejects.toThrow(
      "WEB_APP_INTERNAL_URL",
    );
    expect(mockRenderPdfViaService).not.toHaveBeenCalled();
  });

  it("propagates exceptions from validateTenantContext (rejects empty tenantId)", async () => {
    mockValidate.mockImplementationOnce(() => {
      throw new Error("Job payload missing tenantId");
    });
    await expect(
      processPdfRender(makeJob({ tenantId: "" })),
    ).rejects.toThrow("missing tenantId");
    expect(mockReportExportFindFirstOrThrow).not.toHaveBeenCalled();
  });

});
