// V-pptx-export — pptx-render processor tests.
//
// Verifies the BullMQ job handler for the ON-DEMAND "Render to PowerPoint"
// feature, AFTER the 2026-07-20 rework that made the PPTX derive from the
// report DATA (a fresh Chromium render of /print-render) rather than from the
// already-stored PDF:
//  (1) validates tenant context first,
//  (2) loads the ReportExport row + tenant scoped by (id, tenantId),
//  (3) transitions pptxStatus → "rendering" before doing any work,
//  (4) renders FRESH bytes via renderPdfViaService against the /print-render
//      URL — there is NO Telegram fetch and NO read of the stored PDF,
//  (5) there is NO precondition on the source PDF's status: a "failed" or
//      "queued" PDF still produces a PowerPoint,
//  (6) SOLE store is MinIO — uploads with the pptx content type and persists
//      pptxStatus=ready + pptxFileSizeBytes + pptxTelegramFileId=null; the
//      object key is NOT persisted (readers recompute it),
//  (7) there is NO 20 MB size cap any more (that was a Telegram getFile
//      constraint) — a >20 MB pptx succeeds,
//  (8) purged-row tolerance: a null row returns early WITHOUT throwing, the
//      status writes use updateMany (no P2025), and a row purged between a
//      successful upload and the ready write triggers an orphan deleteObject,
//  (9) on failure (transient, not last attempt): re-throws WITHOUT flipping
//      pptxStatus=failed,
// (10) on failure (last attempt exhausted): pptxStatus=failed + pptxErrorMessage.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { Job } from "bullmq";
import type { PptxRenderJobPayload } from "../../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

const mockReportExportFindFirst = vi.fn();
const mockReportExportUpdate = vi.fn();
const mockReportExportUpdateMany = vi.fn();
const mockTenantFindUniqueOrThrow = vi.fn();

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    reportExport: {
      findFirst: (...args: unknown[]): unknown =>
        mockReportExportFindFirst(...args),
      update: (...args: unknown[]): unknown => mockReportExportUpdate(...args),
      updateMany: (...args: unknown[]): unknown =>
        mockReportExportUpdateMany(...args),
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

const mockRenderPdfPagesToPptx = vi.fn();
vi.mock("../../lib/pdf-to-pptx", () => ({
  renderPdfPagesToPptx: (...args: unknown[]): unknown =>
    mockRenderPdfPagesToPptx(...args),
}));

const mockUploadObject = vi.fn();
const mockDeleteObject = vi.fn();
const mockAssertBucketExists = vi.fn();
vi.mock("@marine-guardian/storage", () => ({
  getExportsBucketName: (): string => "marine-guardian-test-exports",
  buildPptxExportKey: (tenantId: string, exportId: string, at: Date): string =>
    `${tenantId}/${String(at.getUTCFullYear())}/${String(
      at.getUTCMonth() + 1,
    ).padStart(2, "0")}/${exportId}.pptx`,
  assertBucketExists: (...args: unknown[]): unknown =>
    mockAssertBucketExists(...args),
  uploadObject: (...args: unknown[]): unknown => mockUploadObject(...args),
  deleteObject: (...args: unknown[]): unknown => mockDeleteObject(...args),
}));

import { processPptxRender } from "../pptx-render.processor";
import { validateTenantContext } from "../../workers/base-worker";

const mockValidate = validateTenantContext as ReturnType<typeof vi.fn>;

function makeJob(
  overrides: Partial<PptxRenderJobPayload> = {},
  jobOpts: { attemptsMade?: number; attempts?: number } = {},
): Job<PptxRenderJobPayload> {
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
  } as unknown as Job<PptxRenderJobPayload>;
}

const fakePdfBuffer = Buffer.from("%PDF-1.4 fake pdf bytes for testing");
const fakePptxBuffer = Buffer.from("PK-fake-pptx-zip-bytes");

const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("processPptxRender", () => {
  const ORIGINAL_ENV = process.env.WEB_APP_INTERNAL_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_APP_INTERNAL_URL = "http://marine-guardian_test_app:3000";

    mockReportExportFindFirst.mockResolvedValue({
      id: "export-1",
      tenantId: "tenant-1",
      reportType: "coverage",
      paperSize: "A4",
      status: "ready",
    });
    mockTenantFindUniqueOrThrow.mockResolvedValue({
      id: "tenant-1",
      slug: "marine-guardian-sample",
    });
    mockReportExportUpdateMany.mockResolvedValue({ count: 1 });
    mockRenderPdfViaService.mockResolvedValue(fakePdfBuffer);
    mockRenderPdfPagesToPptx.mockResolvedValue(fakePptxBuffer);
    mockAssertBucketExists.mockResolvedValue(undefined);
    mockUploadObject.mockResolvedValue({ key: "ignored" });
    mockDeleteObject.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.WEB_APP_INTERNAL_URL;
    } else {
      process.env.WEB_APP_INTERNAL_URL = ORIGINAL_ENV;
    }
  });

  it("calls validateTenantContext with the job payload before any I/O", async () => {
    await processPptxRender(makeJob());
    expect(mockValidate).toHaveBeenCalledTimes(1);
    expect(mockValidate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      exportId: "export-1",
    });
    expect(mockValidate.mock.invocationCallOrder[0]).toBeLessThan(
      mockReportExportFindFirst.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("loads ReportExport row scoped by exportId AND tenantId (no cross-tenant leak)", async () => {
    await processPptxRender(
      makeJob({ exportId: "export-99", tenantId: "tenant-x" }),
    );
    const call = mockReportExportFindFirst.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
      select: Record<string, boolean>;
    };
    expect(call.where.id).toBe("export-99");
    expect(call.where.tenantId).toBe("tenant-x");
    expect(call.select.paperSize).toBe(true);
  });

  it("transitions pptxStatus to 'rendering' BEFORE rendering, via updateMany (never update)", async () => {
    await processPptxRender(makeJob());
    const firstUpdateCall = mockReportExportUpdateMany.mock.calls[0]?.[0] as {
      data: { pptxStatus: string };
    };
    expect(firstUpdateCall.data.pptxStatus).toBe("rendering");
    expect(mockReportExportUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockRenderPdfViaService.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(mockReportExportUpdate).not.toHaveBeenCalled();
  });

  describe("renders from report data, not from the stored PDF", () => {
    it("calls renderPdfViaService with the /print-render URL, paperSize and derived landscape", async () => {
      await processPptxRender(makeJob());

      expect(mockRenderPdfViaService).toHaveBeenCalledTimes(1);
      expect(mockRenderPdfViaService).toHaveBeenCalledWith({
        printUrl:
          "http://marine-guardian_test_app:3000/print-render/marine-guardian-sample/coverage/export-1",
        paperSize: "A4",
        landscape: true,
        exportId: "export-1",
      });

      const pdfArg = mockRenderPdfPagesToPptx.mock.calls[0]?.[0] as Uint8Array;
      expect(pdfArg).toBeInstanceOf(Uint8Array);
    });

    it("renders non-coverage report types in portrait", async () => {
      mockReportExportFindFirst.mockResolvedValue({
        id: "export-1",
        tenantId: "tenant-1",
        reportType: "report_map",
        paperSize: "Letter",
        status: "ready",
      });

      await processPptxRender(makeJob());

      const call = mockRenderPdfViaService.mock.calls[0]?.[0] as {
        landscape: boolean;
        paperSize: string;
      };
      expect(call.landscape).toBe(false);
      expect(call.paperSize).toBe("Letter");
    });

    it("STILL renders when the source PDF status is 'failed' (precondition removed)", async () => {
      mockReportExportFindFirst.mockResolvedValue({
        id: "export-1",
        tenantId: "tenant-1",
        reportType: "coverage",
        paperSize: "A4",
        status: "failed",
      });

      const result = await processPptxRender(makeJob());

      expect(result.status).toBe("ready");
      expect(mockRenderPdfViaService).toHaveBeenCalledTimes(1);
      expect(mockUploadObject).toHaveBeenCalledTimes(1);
    });

    it("STILL renders when the source PDF status is 'queued'", async () => {
      mockReportExportFindFirst.mockResolvedValue({
        id: "export-1",
        tenantId: "tenant-1",
        reportType: "coverage",
        paperSize: "A4",
        status: "queued",
      });

      const result = await processPptxRender(makeJob());

      expect(result.status).toBe("ready");
      expect(mockRenderPdfViaService).toHaveBeenCalledTimes(1);
    });

    it("throws when WEB_APP_INTERNAL_URL is unset — after the row was moved to rendering", async () => {
      delete process.env.WEB_APP_INTERNAL_URL;

      await expect(
        processPptxRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
      ).rejects.toThrow("WEB_APP_INTERNAL_URL is not configured");
      expect(mockRenderPdfViaService).not.toHaveBeenCalled();
    });
  });

  describe("MinIO storage + purged-row tolerance", () => {
    it("on success: uploads the pptx with the pptx content type and persists pptxStatus=ready", async () => {
      const result = await processPptxRender(makeJob());

      expect(mockAssertBucketExists).toHaveBeenCalledWith(
        "marine-guardian-test-exports",
      );
      expect(mockUploadObject).toHaveBeenCalledTimes(1);
      const uploadCall = mockUploadObject.mock.calls[0]?.[0] as {
        bucket: string;
        key: string;
        body: Buffer;
        contentType: string;
      };
      expect(uploadCall.bucket).toBe("marine-guardian-test-exports");
      expect(uploadCall.key).toMatch(/^tenant-1\/\d{4}\/\d{2}\/export-1\.pptx$/);
      expect(uploadCall.contentType).toBe(PPTX_CONTENT_TYPE);
      expect(uploadCall.body).toBe(fakePptxBuffer);

      expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(2);
      const finalUpdate = mockReportExportUpdateMany.mock.calls[1]?.[0] as {
        data: {
          pptxStatus: string;
          pptxFileSizeBytes: number;
          pptxErrorMessage: string | null;
          pptxTelegramFileId: string | null;
        };
      };
      expect(finalUpdate.data.pptxStatus).toBe("ready");
      expect(finalUpdate.data.pptxFileSizeBytes).toBe(fakePptxBuffer.length);
      expect(finalUpdate.data.pptxErrorMessage).toBeNull();
      expect(finalUpdate.data.pptxTelegramFileId).toBeNull();

      expect(result.status).toBe("ready");
      expect(result.filePath).toBe(uploadCall.key);
      expect(result.fileSizeBytes).toBe(fakePptxBuffer.length);
      expect(mockDeleteObject).not.toHaveBeenCalled();
    });

    it("does NOT persist the pptx object key to any column (readers recompute it)", async () => {
      await processPptxRender(makeJob());
      const finalUpdate = mockReportExportUpdateMany.mock.calls[1]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(Object.keys(finalUpdate.data).sort()).toEqual([
        "pptxErrorMessage",
        "pptxFileSizeBytes",
        "pptxStatus",
        "pptxTelegramFileId",
      ]);
    });

    it("succeeds for a pptx larger than 20 MB (the Telegram getFile cap is gone)", async () => {
      const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x50);
      mockRenderPdfPagesToPptx.mockResolvedValueOnce(oversized);

      const result = await processPptxRender(makeJob());

      expect(result.status).toBe("ready");
      expect(result.fileSizeBytes).toBe(oversized.length);
      expect(mockUploadObject).toHaveBeenCalledTimes(1);
    });

    it("returns early WITHOUT throwing when the row was purged before the render started", async () => {
      mockReportExportFindFirst.mockResolvedValue(null);

      const result = await processPptxRender(makeJob());

      expect(result.status).toBe("failed");
      expect(result.errorMessage).toContain("purged");
      expect(mockRenderPdfViaService).not.toHaveBeenCalled();
      expect(mockRenderPdfPagesToPptx).not.toHaveBeenCalled();
      expect(mockUploadObject).not.toHaveBeenCalled();
      expect(mockReportExportUpdateMany).not.toHaveBeenCalled();
      expect(mockTenantFindUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("deletes the orphaned object when the row was purged after a successful upload", async () => {
      mockReportExportUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await processPptxRender(makeJob());

      const uploadCall = mockUploadObject.mock.calls[0]?.[0] as { key: string };
      expect(mockDeleteObject).toHaveBeenCalledTimes(1);
      expect(mockDeleteObject).toHaveBeenCalledWith({
        bucket: "marine-guardian-test-exports",
        key: uploadCall.key,
      });
      expect(result.status).toBe("ready");
    });

    it("a failing orphan cleanup still yields a ready result", async () => {
      mockReportExportUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      mockDeleteObject.mockRejectedValueOnce(new Error("minio delete boom"));

      const result = await processPptxRender(makeJob());

      expect(result.status).toBe("ready");
    });

    it("retries a transient upload failure without re-rendering", async () => {
      mockUploadObject
        .mockRejectedValueOnce(new Error("minio 503"))
        .mockRejectedValueOnce(new Error("minio 503"))
        .mockResolvedValueOnce({ key: "ok" });

      vi.useFakeTimers();
      try {
        const pending = processPptxRender(makeJob());
        await vi.runAllTimersAsync();
        const result = await pending;
        expect(result.status).toBe("ready");
      } finally {
        vi.useRealTimers();
      }

      expect(mockUploadObject).toHaveBeenCalledTimes(3);
      expect(mockRenderPdfViaService).toHaveBeenCalledTimes(1);
      expect(mockRenderPdfPagesToPptx).toHaveBeenCalledTimes(1);
    });
  });

  it("on transient failure (NOT last attempt): re-throws WITHOUT flipping pptxStatus=failed", async () => {
    mockRenderPdfPagesToPptx.mockRejectedValueOnce(
      new Error("rasterize failed"),
    );

    await expect(
      processPptxRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("rasterize failed");

    const statuses = mockReportExportUpdateMany.mock.calls.map(
      (c) => (c[0] as { data: { pptxStatus?: string } }).data.pptxStatus,
    );
    expect(statuses).toEqual(["rendering"]);
    expect(statuses).not.toContain("failed");
  });

  it("on final failure (last attempt exhausted): pptxStatus=failed + pptxErrorMessage + re-throws", async () => {
    mockRenderPdfViaService.mockRejectedValue(
      new Error("pdf-renderer returned non-OK status 500"),
    );

    await expect(
      processPptxRender(makeJob({}, { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow("500");

    expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(2);
    const failedUpdate = mockReportExportUpdateMany.mock.calls[1]?.[0] as {
      data: { pptxStatus: string; pptxErrorMessage: string };
    };
    expect(failedUpdate.data.pptxStatus).toBe("failed");
    expect(failedUpdate.data.pptxErrorMessage).toContain("500");
  });
});
