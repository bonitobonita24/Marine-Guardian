// 5.3b → 5.3c — pdf-render processor tests.
//
// Verifies the BullMQ job handler:
//  (1) validates tenant context first,
//  (2) loads the ReportExport row + tenant slug via the platformPrisma cast,
//  (3) transitions status queued → rendering before invoking the renderer,
//  (4) constructs printUrl from WEB_APP_INTERNAL_URL + tenant.slug + row.reportType + row.id,
//  (5) calls renderPdfViaService with paperSize + landscape derived from the row,
//  (6) uploads the rendered PDF via @marine-guardian/storage.uploadPdf using
//      bucket=marine-guardian-{env}-exports + key=${tenantId}/${YYYY}/${MM}/${exportId}.pdf
//      (5.3c replaced the 5.3b stub),
//  (7) on success: status=ready + filePath (key, NOT full bucket path) +
//      fileSizeBytes + completedAt atomically + Returns RenderResult,
//  (8) on render failure (transient): re-throws to trigger BullMQ retry — does NOT
//      flip status=failed until the LAST attempt (attemptsMade+1 == attempts),
//  (9) on render failure (last retry exhausted): status=failed + errorMessage
//      + re-throws,
// (10) on storage upload failure (5.3c): follows the same retry semantics —
//      re-throws on transient attempts, flips status=failed on last attempt.

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

const mockUploadDocumentToTelegram = vi.fn();
vi.mock("../../lib/telegram-storage", () => ({
  uploadDocumentToTelegram: (...args: unknown[]): unknown =>
    mockUploadDocumentToTelegram(...args),
}));

const mockUploadPdf = vi.fn();
vi.mock("@marine-guardian/storage", () => ({
  uploadPdf: (...args: unknown[]): unknown => mockUploadPdf(...args),
  // Pure helpers — replicate behavior rather than mock so the processor
  // continues to build canonical bucket+key values from real env+date logic.
  getExportsBucketName: (): string => {
    const env = process.env.APP_ENV;
    const resolved = env === undefined || env === "" ? "dev" : env;
    return `marine-guardian-${resolved}-exports`;
  },
  buildExportKey: (tenantId: string, exportId: string, at: Date): string => {
    const year = String(at.getUTCFullYear());
    const month = String(at.getUTCMonth() + 1).padStart(2, "0");
    return `${tenantId}/${year}/${month}/${exportId}.pdf`;
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
  const ORIGINAL_TELEGRAM_ENV = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_DEFAULT_CHANNEL_ID: process.env.TELEGRAM_DEFAULT_CHANNEL_ID,
    REPORT_EXPORTS_MINIO_FALLBACK: process.env.REPORT_EXPORTS_MINIO_FALLBACK,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_APP_INTERNAL_URL = "http://marine-guardian_test_app:3000";
    // Default = Telegram NOT configured, so the legacy MinIO-path tests
    // below exercise the graceful degrade; Telegram tests opt in per-test.
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_DEFAULT_CHANNEL_ID;
    delete process.env.REPORT_EXPORTS_MINIO_FALLBACK;

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
      telegramChannelId: null,
    });
    mockReportExportUpdate.mockResolvedValue({});
    mockRenderPdfViaService.mockResolvedValue(fakePdfBuffer);
    mockUploadDocumentToTelegram.mockResolvedValue({
      messageId: 42,
      fileId: "tg-file-abc",
    });
    mockUploadPdf.mockImplementation(
      (input: { bucket: string; key: string; body: Buffer }) =>
        Promise.resolve({ key: input.key }),
    );
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.WEB_APP_INTERNAL_URL;
    } else {
      process.env.WEB_APP_INTERNAL_URL = ORIGINAL_ENV;
    }
    if (ORIGINAL_TELEGRAM_ENV.TELEGRAM_BOT_TOKEN === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TELEGRAM_ENV.TELEGRAM_BOT_TOKEN;
    }
    if (ORIGINAL_TELEGRAM_ENV.TELEGRAM_DEFAULT_CHANNEL_ID === undefined) {
      delete process.env.TELEGRAM_DEFAULT_CHANNEL_ID;
    } else {
      process.env.TELEGRAM_DEFAULT_CHANNEL_ID =
        ORIGINAL_TELEGRAM_ENV.TELEGRAM_DEFAULT_CHANNEL_ID;
    }
    if (ORIGINAL_TELEGRAM_ENV.REPORT_EXPORTS_MINIO_FALLBACK === undefined) {
      delete process.env.REPORT_EXPORTS_MINIO_FALLBACK;
    } else {
      process.env.REPORT_EXPORTS_MINIO_FALLBACK =
        ORIGINAL_TELEGRAM_ENV.REPORT_EXPORTS_MINIO_FALLBACK;
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

  it("on success: updates status=ready + filePath (key only) + fileSizeBytes + completedAt", async () => {
    process.env.APP_ENV = "test";
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
    // 5.3c — filePath stores the KEY only (tenant/year/month/export.pdf),
    // NOT the full bucket+key path. Bucket name is env-derived at read time.
    expect(finalUpdate.data.filePath).toMatch(
      /^tenant-1\/\d{4}\/\d{2}\/export-1\.pdf$/,
    );
    expect(finalUpdate.data.fileSizeBytes).toBe(fakePdfBuffer.length);
    expect(finalUpdate.data.completedAt).toBeInstanceOf(Date);
    expect(result.status).toBe("ready");
    expect(result.exportId).toBe("export-1");
    expect(result.filePath).toBe(finalUpdate.data.filePath);
  });

  it("uploads PDF via @marine-guardian/storage.uploadPdf with derived bucket + key + buffer (5.3c)", async () => {
    process.env.APP_ENV = "test";
    await processPdfRender(makeJob());

    expect(mockUploadPdf).toHaveBeenCalledTimes(1);
    const call = mockUploadPdf.mock.calls[0]?.[0] as {
      bucket: string;
      key: string;
      body: Buffer;
    };
    expect(call.bucket).toBe("marine-guardian-test-exports");
    expect(call.key).toMatch(
      /^tenant-1\/\d{4}\/\d{2}\/export-1\.pdf$/,
    );
    expect(call.body).toBe(fakePdfBuffer);

    // Ordering check: upload fires AFTER the renderer returns + BEFORE the
    // final status=ready update.
    expect(mockUploadPdf.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockRenderPdfViaService.mock.invocationCallOrder[0] ?? -Infinity,
    );
    expect(mockUploadPdf.mock.invocationCallOrder[0]).toBeLessThan(
      mockReportExportUpdate.mock.invocationCallOrder[1] ?? Infinity,
    );
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

  it("on storage upload failure (NOT last attempt): re-throws WITHOUT flipping status=failed (5.3c)", async () => {
    mockUploadPdf.mockRejectedValueOnce(
      new Error("MinIO PUT failed: ECONNREFUSED"),
    );

    await expect(
      processPdfRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("ECONNREFUSED");

    // Only the queued→rendering update — storage failure should follow the
    // same retry semantics as renderer failure (no status=failed flip).
    const updates = mockReportExportUpdate.mock.calls.map(
      (c) => (c[0] as { data: { status?: string } }).data.status,
    );
    expect(updates).toEqual(["rendering"]);
  });

  it("on storage upload failure (last attempt): flips status=failed + records errorMessage (5.3c)", async () => {
    mockUploadPdf.mockRejectedValueOnce(
      new Error("MinIO PUT failed: bucket policy denied"),
    );

    await expect(
      processPdfRender(makeJob({}, { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow("bucket policy denied");

    expect(mockReportExportUpdate).toHaveBeenCalledTimes(2);
    const failedUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
      where: { id: string };
      data: { status: string; errorMessage: string; completedAt: Date };
    };
    expect(failedUpdate.where.id).toBe("export-1");
    expect(failedUpdate.data.status).toBe("failed");
    expect(failedUpdate.data.errorMessage).toContain("bucket policy denied");
    expect(failedUpdate.data.completedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // Phase 4 S1 — Telegram-primary storage.
  // -------------------------------------------------------------------------

  describe("Telegram-primary storage (Phase 4 S1)", () => {
    function configureTelegram(channelOnTenant = true): void {
      process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
      mockTenantFindUniqueOrThrow.mockResolvedValue({
        id: "tenant-1",
        slug: "marine-guardian-sample",
        telegramChannelId: channelOnTenant ? "-1003816125998" : null,
      });
    }

    it("sends the PDF to the tenant's Telegram channel and persists telegramFileId (MinIO NOT written, flag off)", async () => {
      configureTelegram();

      const result = await processPdfRender(makeJob());

      expect(mockUploadDocumentToTelegram).toHaveBeenCalledTimes(1);
      const call = mockUploadDocumentToTelegram.mock.calls[0]?.[0] as {
        botToken: string;
        chatId: string;
        bytes: Uint8Array;
        filename: string;
        mimeType: string;
      };
      expect(call.botToken).toBe("test-bot-token");
      expect(call.chatId).toBe("-1003816125998");
      expect(call.bytes).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(call.bytes).equals(fakePdfBuffer)).toBe(true);
      expect(call.filename).toBe("coverage-export-1.pdf");
      expect(call.mimeType).toBe("application/pdf");

      // Telegram is PRIMARY: default (flag off) skips the MinIO write.
      expect(mockUploadPdf).not.toHaveBeenCalled();

      const finalUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
        data: {
          status: string;
          telegramFileId: string | null;
          filePath: string | null;
          fileSizeBytes: number;
        };
      };
      expect(finalUpdate.data.status).toBe("ready");
      expect(finalUpdate.data.telegramFileId).toBe("tg-file-abc");
      expect(finalUpdate.data.filePath).toBeNull();
      expect(finalUpdate.data.fileSizeBytes).toBe(fakePdfBuffer.length);
      expect(result.telegramFileId).toBe("tg-file-abc");
      expect(result.filePath).toBeUndefined();
    });

    it("falls back to TELEGRAM_DEFAULT_CHANNEL_ID when the tenant has no telegramChannelId", async () => {
      configureTelegram(false);
      process.env.TELEGRAM_DEFAULT_CHANNEL_ID = "-1009999999999";

      await processPdfRender(makeJob());

      expect(mockUploadDocumentToTelegram).toHaveBeenCalledTimes(1);
      expect(
        (mockUploadDocumentToTelegram.mock.calls[0]?.[0] as { chatId: string })
          .chatId,
      ).toBe("-1009999999999");
    });

    it("REPORT_EXPORTS_MINIO_FALLBACK=true additionally mirrors the PDF to MinIO (both locations persisted)", async () => {
      configureTelegram();
      process.env.REPORT_EXPORTS_MINIO_FALLBACK = "true";
      process.env.APP_ENV = "test";

      await processPdfRender(makeJob());

      expect(mockUploadDocumentToTelegram).toHaveBeenCalledTimes(1);
      expect(mockUploadPdf).toHaveBeenCalledTimes(1);
      const finalUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
        data: { telegramFileId: string | null; filePath: string | null };
      };
      expect(finalUpdate.data.telegramFileId).toBe("tg-file-abc");
      expect(finalUpdate.data.filePath).toMatch(
        /^tenant-1\/\d{4}\/\d{2}\/export-1\.pdf$/,
      );
    });

    it("degrades gracefully to MinIO when Telegram is unconfigured (no token / no channel)", async () => {
      // beforeEach default: no TELEGRAM_BOT_TOKEN, tenant channel null.
      await processPdfRender(makeJob());

      expect(mockUploadDocumentToTelegram).not.toHaveBeenCalled();
      expect(mockUploadPdf).toHaveBeenCalledTimes(1);
      const finalUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
        data: { telegramFileId: string | null; filePath: string | null };
      };
      expect(finalUpdate.data.telegramFileId).toBeNull();
      expect(finalUpdate.data.filePath).toMatch(/export-1\.pdf$/);
    });

    it("skips Telegram for PDFs above the 20 MB getFile cap (stored-but-undownloadable guard) → MinIO", async () => {
      configureTelegram();
      const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x25);
      mockRenderPdfViaService.mockResolvedValueOnce(oversized);

      await processPdfRender(makeJob());

      expect(mockUploadDocumentToTelegram).not.toHaveBeenCalled();
      expect(mockUploadPdf).toHaveBeenCalledTimes(1);
    });

    it("retries the Telegram send on transient failure, then persists the file_id (archive-er-assets retry pattern)", async () => {
      configureTelegram();
      mockUploadDocumentToTelegram
        .mockRejectedValueOnce(new Error("Telegram sendDocument failed: 500"))
        .mockRejectedValueOnce(new Error("Telegram sendDocument failed: 429"))
        .mockResolvedValueOnce({ messageId: 7, fileId: "tg-file-retried" });

      vi.useFakeTimers();
      try {
        const pending = processPdfRender(makeJob());
        await vi.runAllTimersAsync();
        const result = await pending;
        expect(result.telegramFileId).toBe("tg-file-retried");
      } finally {
        vi.useRealTimers();
      }
      expect(mockUploadDocumentToTelegram).toHaveBeenCalledTimes(3);
    });

    it("re-throws after retries are exhausted WITHOUT flipping status=failed on a non-final BullMQ attempt", async () => {
      configureTelegram();
      mockUploadDocumentToTelegram.mockRejectedValue(
        new Error("Telegram sendDocument failed: chat not found"),
      );

      vi.useFakeTimers();
      try {
        const pending = processPdfRender(
          makeJob({}, { attemptsMade: 0, attempts: 3 }),
        );
        const assertion = expect(pending).rejects.toThrow("chat not found");
        await vi.runAllTimersAsync();
        await assertion;
      } finally {
        vi.useRealTimers();
      }

      expect(mockUploadDocumentToTelegram).toHaveBeenCalledTimes(3);
      const updates = mockReportExportUpdate.mock.calls.map(
        (c) => (c[0] as { data: { status?: string } }).data.status,
      );
      expect(updates).toEqual(["rendering"]);
    });

    it("throws when Telegram returns an empty file_id (never persists a ready row without a locator)", async () => {
      configureTelegram();
      mockUploadDocumentToTelegram.mockResolvedValue({
        messageId: 7,
        fileId: "",
      });

      vi.useFakeTimers();
      try {
        const pending = processPdfRender(makeJob());
        const assertion = expect(pending).rejects.toThrow("no document file_id");
        await vi.runAllTimersAsync();
        await assertion;
      } finally {
        vi.useRealTimers();
      }

      const updates = mockReportExportUpdate.mock.calls.map(
        (c) => (c[0] as { data: { status?: string } }).data.status,
      );
      expect(updates).not.toContain("ready");
    });
  });

});
