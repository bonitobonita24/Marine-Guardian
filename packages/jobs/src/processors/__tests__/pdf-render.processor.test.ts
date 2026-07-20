// 5.3b → 5.3c → Phase 4 S2 — pdf-render processor tests.
//
// Verifies the BullMQ job handler:
//  (1) validates tenant context first,
//  (2) loads the ReportExport row + tenant slug via the platformPrisma cast,
//  (3) transitions status queued → rendering before invoking the renderer,
//  (4) constructs printUrl from WEB_APP_INTERNAL_URL + tenant.slug + row.reportType + row.id,
//  (5) calls renderPdfViaService with paperSize + landscape derived from the row,
//  (6) SOLE store is MinIO (Telegram was abandoned for report exports on
//      2026-07-20 — its getFile download cap is 20 MB and a report_map export
//      already measured 18.86 MB). A ready row persists filePath=<object key>
//      + telegramFileId=null, and there is NO size cap any more,
//  (7) on success: status=ready + filePath + telegramFileId=null +
//      fileSizeBytes + completedAt atomically + Returns RenderResult,
//  (8) on render failure (transient): re-throws to trigger BullMQ retry — does NOT
//      flip status=failed until the LAST attempt (attemptsMade+1 == attempts),
//  (9) on render failure (last retry exhausted): status=failed + errorMessage
//      + re-throws,
// (10) purged-row tolerance: a null row returns early WITHOUT throwing, the
//      status writes use updateMany (no P2025), and a row purged between a
//      successful upload and the ready write triggers an orphan deleteObject.

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

const mockUploadObject = vi.fn();
const mockDeleteObject = vi.fn();
const mockAssertBucketExists = vi.fn();
vi.mock("@marine-guardian/storage", () => ({
  getExportsBucketName: (): string => "marine-guardian-test-exports",
  buildExportKey: (tenantId: string, exportId: string, at: Date): string =>
    `${tenantId}/${String(at.getUTCFullYear())}/${String(
      at.getUTCMonth() + 1,
    ).padStart(2, "0")}/${exportId}.pdf`,
  assertBucketExists: (...args: unknown[]): unknown =>
    mockAssertBucketExists(...args),
  uploadObject: (...args: unknown[]): unknown => mockUploadObject(...args),
  deleteObject: (...args: unknown[]): unknown => mockDeleteObject(...args),
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

    mockReportExportFindFirst.mockResolvedValue({
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
    mockReportExportUpdateMany.mockResolvedValue({ count: 1 });
    mockRenderPdfViaService.mockResolvedValue(fakePdfBuffer);
    mockAssertBucketExists.mockResolvedValue(undefined);
    mockUploadObject.mockImplementation(
      (input: { key: string }): Promise<{ key: string }> =>
        Promise.resolve({ key: input.key }),
    );
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
    await processPdfRender(makeJob());
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
    await processPdfRender(makeJob({ exportId: "export-99", tenantId: "tenant-x" }));
    expect(mockReportExportFindFirst).toHaveBeenCalledTimes(1);
    const call = mockReportExportFindFirst.mock.calls[0]?.[0] as {
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

  it("transitions status queued → rendering BEFORE invoking the renderer (via updateMany — tolerates a purged row)", async () => {
    await processPdfRender(makeJob());
    const firstUpdateCall = mockReportExportUpdateMany.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string };
    };
    expect(firstUpdateCall.where.id).toBe("export-1");
    expect(firstUpdateCall.data.status).toBe("rendering");
    // update() would throw P2025 on a purged row — it must not be used at all.
    expect(mockReportExportUpdate).not.toHaveBeenCalled();
    // Ordering check: rendering update fires before renderer call.
    expect(mockReportExportUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockRenderPdfViaService.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("constructs printUrl from WEB_APP_INTERNAL_URL + tenant.slug + reportType + exportId", async () => {
    mockTenantFindUniqueOrThrow.mockResolvedValueOnce({
      id: "tenant-1",
      slug: "acme-rangers",
    });
    mockReportExportFindFirst.mockResolvedValueOnce({
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
    mockReportExportFindFirst.mockResolvedValueOnce({
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
    mockReportExportFindFirst.mockResolvedValueOnce({
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

  it("on success: uploads the PDF to MinIO and persists status=ready + filePath=<key> + telegramFileId=null + fileSizeBytes + completedAt", async () => {
    const result = await processPdfRender(makeJob());

    expect(mockAssertBucketExists).toHaveBeenCalledWith(
      "marine-guardian-test-exports",
    );
    expect(mockUploadObject).toHaveBeenCalledTimes(1);
    const call = mockUploadObject.mock.calls[0]?.[0] as {
      bucket: string;
      key: string;
      body: Buffer;
      contentType: string;
    };
    expect(call.bucket).toBe("marine-guardian-test-exports");
    expect(call.key).toMatch(/^tenant-1\/\d{4}\/\d{2}\/export-1\.pdf$/);
    expect(Buffer.from(call.body).equals(fakePdfBuffer)).toBe(true);
    expect(call.contentType).toBe("application/pdf");

    // Two writes, both updateMany: queued→rendering, then rendering→ready.
    expect(mockReportExportUpdate).not.toHaveBeenCalled();
    expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(2);
    const finalUpdate = mockReportExportUpdateMany.mock.calls[1]?.[0] as {
      where: { id: string };
      data: {
        status: string;
        telegramFileId: string | null;
        filePath: string | null;
        fileSizeBytes: number;
        completedAt: Date;
      };
    };
    expect(finalUpdate.where.id).toBe("export-1");
    expect(finalUpdate.data.status).toBe("ready");
    // The MinIO object key now lives in the pre-existing filePath column, and
    // the Telegram locator is explicitly cleared.
    expect(finalUpdate.data.filePath).toBe(call.key);
    expect(finalUpdate.data.telegramFileId).toBeNull();
    expect(finalUpdate.data.fileSizeBytes).toBe(fakePdfBuffer.length);
    expect(finalUpdate.data.completedAt).toBeInstanceOf(Date);

    expect(result.status).toBe("ready");
    expect(result.exportId).toBe("export-1");
    expect(result.filePath).toBe(call.key);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("on transient failure (NOT last attempt): re-throws WITHOUT flipping status=failed", async () => {
    mockRenderPdfViaService.mockRejectedValueOnce(
      new Error("pdf-renderer fetch failed: ECONNRESET"),
    );

    await expect(
      processPdfRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("ECONNRESET");

    // Only the queued→rendering update — no status=failed flip yet.
    const updates = mockReportExportUpdateMany.mock.calls.map(
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

    // queued→rendering, then rendering→failed via the guarded updateMany
    // (only touches a still-pending row).
    expect(mockReportExportUpdate).not.toHaveBeenCalled();
    expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(2);
    const failedUpdate = mockReportExportUpdateMany.mock.calls[1]?.[0] as {
      where: { id: string; status: { in: string[] } };
      data: { status: string; errorMessage: string; completedAt: Date };
    };
    expect(failedUpdate.where.id).toBe("export-1");
    expect(failedUpdate.where.status.in).toEqual(["queued", "rendering"]);
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

  it("marks the row FAILED (never leaves it stuck at queued) when WEB_APP_INTERNAL_URL is missing on the last attempt", async () => {
    // Regression for the prod incident (owner report 2026-07-06): the worker
    // container lacked WEB_APP_INTERNAL_URL, the guard threw BEFORE the row was
    // ever touched (and outside the try/catch), so the report_exports row was
    // left `queued` forever and /exports spun indefinitely. The row must now be
    // flipped to `failed` with the error persisted so the UI shows a failure.
    delete process.env.WEB_APP_INTERNAL_URL;

    await expect(
      processPdfRender(makeJob({}, { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow("WEB_APP_INTERNAL_URL");

    // Renderer never runs; row loaded first so the failure can be persisted.
    expect(mockRenderPdfViaService).not.toHaveBeenCalled();
    expect(mockReportExportFindFirst).toHaveBeenCalledTimes(1);

    // The failure is written via the guarded updateMany (queued/rendering only)
    // — the row ends up `failed`, NOT left `queued`. The renderer never ran, so
    // the queued→rendering write never happened either: exactly one call.
    expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(1);
    const failedUpdate = mockReportExportUpdateMany.mock.calls[0]?.[0] as {
      where: { id: string; status: { in: string[] } };
      data: { status: string; errorMessage: string; completedAt: Date };
    };
    expect(failedUpdate.where.id).toBe("export-1");
    expect(failedUpdate.where.status.in).toEqual(["queued", "rendering"]);
    expect(failedUpdate.data.status).toBe("failed");
    expect(failedUpdate.data.errorMessage).toContain("WEB_APP_INTERNAL_URL");
    expect(failedUpdate.data.completedAt).toBeInstanceOf(Date);
  });

  it("propagates exceptions from validateTenantContext (rejects empty tenantId)", async () => {
    mockValidate.mockImplementationOnce(() => {
      throw new Error("Job payload missing tenantId");
    });
    await expect(
      processPdfRender(makeJob({ tenantId: "" })),
    ).rejects.toThrow("missing tenantId");
    expect(mockReportExportFindFirst).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Ephemeral exports — MinIO storage + purged-row tolerance.
  // -------------------------------------------------------------------------

  describe("MinIO storage + purged-row tolerance", () => {
    it("stores a PDF ABOVE the old 20 MB Telegram cap without complaint (the cap is gone)", async () => {
      const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x25);
      mockRenderPdfViaService.mockResolvedValueOnce(oversized);

      const result = await processPdfRender(makeJob());

      expect(result.status).toBe("ready");
      expect(mockUploadObject).toHaveBeenCalledTimes(1);
      expect(result.fileSizeBytes).toBe(oversized.length);
    });

    it("returns early (no throw, no renderer call) when the row was already purged", async () => {
      mockReportExportFindFirst.mockResolvedValueOnce(null);

      const result = await processPdfRender(makeJob());

      expect(result).toEqual({
        exportId: "export-1",
        status: "failed",
        errorMessage: "export row no longer exists (purged)",
      });
      // Throwing here would burn three BullMQ retries on expected behaviour.
      expect(mockRenderPdfViaService).not.toHaveBeenCalled();
      expect(mockUploadObject).not.toHaveBeenCalled();
      expect(mockReportExportUpdateMany).not.toHaveBeenCalled();
      expect(mockTenantFindUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("deletes the orphaned object when the row is purged between upload and the ready write", async () => {
      mockReportExportUpdateMany
        .mockResolvedValueOnce({ count: 1 }) // queued → rendering
        .mockResolvedValueOnce({ count: 0 }); // ready write — row is gone

      const result = await processPdfRender(makeJob());

      const uploadedKey = (
        mockUploadObject.mock.calls[0]?.[0] as { key: string }
      ).key;
      expect(mockDeleteObject).toHaveBeenCalledTimes(1);
      expect(mockDeleteObject).toHaveBeenCalledWith({
        bucket: "marine-guardian-test-exports",
        key: uploadedKey,
      });
      // Still a successful job — the render did its work.
      expect(result.status).toBe("ready");
    });

    it("never lets an orphan-cleanup failure fail the job", async () => {
      mockReportExportUpdateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      mockDeleteObject.mockRejectedValueOnce(new Error("minio 503"));

      const result = await processPdfRender(makeJob());

      expect(result.status).toBe("ready");
    });

    it("retries a transient MinIO upload failure, then succeeds (withRetry preserved — no re-render)", async () => {
      mockUploadObject
        .mockRejectedValueOnce(new Error("minio putObject failed: 500"))
        .mockRejectedValueOnce(new Error("minio putObject failed: ECONNRESET"))
        .mockImplementationOnce(
          (input: { key: string }): Promise<{ key: string }> =>
            Promise.resolve({ key: input.key }),
        );

      vi.useFakeTimers();
      try {
        const pending = processPdfRender(makeJob());
        await vi.runAllTimersAsync();
        const result = await pending;
        expect(result.status).toBe("ready");
      } finally {
        vi.useRealTimers();
      }
      expect(mockUploadObject).toHaveBeenCalledTimes(3);
      // The expensive render ran exactly once — that is the point of withRetry.
      expect(mockRenderPdfViaService).toHaveBeenCalledTimes(1);
    });

    it("on a persistent upload failure at the LAST attempt: flips the row to failed via the existing error path", async () => {
      mockUploadObject.mockRejectedValue(
        new Error("minio putObject failed: bucket unreachable"),
      );

      vi.useFakeTimers();
      try {
        const pending = processPdfRender(
          makeJob({}, { attemptsMade: 2, attempts: 3 }),
        );
        const assertion = expect(pending).rejects.toThrow("bucket unreachable");
        await vi.runAllTimersAsync();
        await assertion;
      } finally {
        vi.useRealTimers();
      }

      // queued→rendering, then rendering→failed.
      expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(2);
      const failedUpdate = mockReportExportUpdateMany.mock.calls[1]?.[0] as {
        where: { id: string; status: { in: string[] } };
        data: { status: string; errorMessage: string };
      };
      expect(failedUpdate.where.status.in).toEqual(["queued", "rendering"]);
      expect(failedUpdate.data.status).toBe("failed");
      expect(failedUpdate.data.errorMessage).toContain("bucket unreachable");
    });

    it("on a persistent upload failure that is NOT the last attempt: re-throws without flipping to failed", async () => {
      mockUploadObject.mockRejectedValue(new Error("minio putObject failed"));

      vi.useFakeTimers();
      try {
        const pending = processPdfRender(
          makeJob({}, { attemptsMade: 0, attempts: 3 }),
        );
        const assertion = expect(pending).rejects.toThrow("putObject failed");
        await vi.runAllTimersAsync();
        await assertion;
      } finally {
        vi.useRealTimers();
      }

      const updates = mockReportExportUpdateMany.mock.calls.map(
        (c) => (c[0] as { data: { status?: string } }).data.status,
      );
      expect(updates).toEqual(["rendering"]);
    });
  });
});
