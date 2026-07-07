// 5.3b → 5.3c → Phase 4 S2 — pdf-render processor tests.
//
// Verifies the BullMQ job handler:
//  (1) validates tenant context first,
//  (2) loads the ReportExport row + tenant slug via the platformPrisma cast,
//  (3) transitions status queued → rendering before invoking the renderer,
//  (4) constructs printUrl from WEB_APP_INTERNAL_URL + tenant.slug + row.reportType + row.id,
//  (5) calls renderPdfViaService with paperSize + landscape derived from the row,
//  (6) SOLE store is Telegram — there is no server-side/MinIO write at any
//      point. A ready row always persists filePath=null + telegramFileId,
//  (7) on success: status=ready + telegramFileId + filePath=null +
//      fileSizeBytes + completedAt atomically + Returns RenderResult,
//  (8) on render failure (transient): re-throws to trigger BullMQ retry — does NOT
//      flip status=failed until the LAST attempt (attemptsMade+1 == attempts),
//  (9) on render failure (last retry exhausted): status=failed + errorMessage
//      + re-throws,
// (10) when Telegram is unconfigured for the tenant, OR the PDF exceeds the
//      20 MB getFile cap, the job THROWS (no silent local write) and follows
//      the same retry semantics as a render failure.

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
const mockReportExportUpdateMany = vi.fn();
const mockTenantFindUniqueOrThrow = vi.fn();

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    reportExport: {
      findFirstOrThrow: (...args: unknown[]): unknown =>
        mockReportExportFindFirstOrThrow(...args),
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

const mockUploadDocumentToTelegram = vi.fn();
vi.mock("../../lib/telegram-storage", () => ({
  uploadDocumentToTelegram: (...args: unknown[]): unknown =>
    mockUploadDocumentToTelegram(...args),
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_APP_INTERNAL_URL = "http://marine-guardian_test_app:3000";
    // Default = Telegram CONFIGURED (sole store) so the mainline tests below
    // exercise the success path; the "unconfigured" tests opt out per-test.
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    delete process.env.TELEGRAM_DEFAULT_CHANNEL_ID;

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
      telegramChannelId: "-1003816125998",
    });
    mockReportExportUpdate.mockResolvedValue({});
    mockReportExportUpdateMany.mockResolvedValue({ count: 1 });
    mockRenderPdfViaService.mockResolvedValue(fakePdfBuffer);
    mockUploadDocumentToTelegram.mockResolvedValue({
      messageId: 42,
      fileId: "tg-file-abc",
    });
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
      telegramChannelId: "-1003816125998",
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

  it("on success: sends the PDF to Telegram and persists status=ready + telegramFileId + filePath=null + fileSizeBytes + completedAt (no server-side copy)", async () => {
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

    // Two updates: queued→rendering, then rendering→ready.
    expect(mockReportExportUpdate).toHaveBeenCalledTimes(2);
    const finalUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
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
    expect(finalUpdate.data.telegramFileId).toBe("tg-file-abc");
    // Strictly Telegram-only — filePath is ALWAYS null, never a server-side
    // (MinIO or otherwise) key.
    expect(finalUpdate.data.filePath).toBeNull();
    expect(finalUpdate.data.fileSizeBytes).toBe(fakePdfBuffer.length);
    expect(finalUpdate.data.completedAt).toBeInstanceOf(Date);

    expect(result.status).toBe("ready");
    expect(result.exportId).toBe("export-1");
    expect(result.telegramFileId).toBe("tg-file-abc");
  });

  it("falls back to TELEGRAM_DEFAULT_CHANNEL_ID when the tenant has no telegramChannelId", async () => {
    mockTenantFindUniqueOrThrow.mockResolvedValue({
      id: "tenant-1",
      slug: "marine-guardian-sample",
      telegramChannelId: null,
    });
    process.env.TELEGRAM_DEFAULT_CHANNEL_ID = "-1009999999999";

    await processPdfRender(makeJob());

    expect(mockUploadDocumentToTelegram).toHaveBeenCalledTimes(1);
    expect(
      (mockUploadDocumentToTelegram.mock.calls[0]?.[0] as { chatId: string })
        .chatId,
    ).toBe("-1009999999999");
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

    // queued→rendering via update; rendering→failed via the guarded
    // updateMany (only touches a still-pending row).
    expect(mockReportExportUpdate).toHaveBeenCalledTimes(1);
    expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(1);
    const failedUpdate = mockReportExportUpdateMany.mock.calls[0]?.[0] as {
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
    expect(mockReportExportFindFirstOrThrow).toHaveBeenCalledTimes(1);

    // The failure is written via the guarded updateMany (queued/rendering only)
    // — the row ends up `failed`, NOT left `queued`.
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
    expect(mockReportExportFindFirstOrThrow).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Phase 4 S2 — strict Telegram-only storage (no server-side/MinIO write).
  // -------------------------------------------------------------------------

  describe("strict Telegram-only storage (Phase 4 S2)", () => {
    it("throws (job fails cleanly) when Telegram is unconfigured for the tenant — NOT last attempt: no status=failed flip", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      mockTenantFindUniqueOrThrow.mockResolvedValue({
        id: "tenant-1",
        slug: "marine-guardian-sample",
        telegramChannelId: null,
      });

      await expect(
        processPdfRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
      ).rejects.toThrow("Telegram not configured for tenant");

      expect(mockUploadDocumentToTelegram).not.toHaveBeenCalled();
      const updates = mockReportExportUpdate.mock.calls.map(
        (c) => (c[0] as { data: { status?: string } }).data.status,
      );
      expect(updates).toEqual(["rendering"]);
      expect(updates).not.toContain("failed");
    });

    it("on last attempt with Telegram unconfigured: flips status=failed + descriptive errorMessage", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      mockTenantFindUniqueOrThrow.mockResolvedValue({
        id: "tenant-1",
        slug: "marine-guardian-sample",
        telegramChannelId: null,
      });

      await expect(
        processPdfRender(makeJob({}, { attemptsMade: 2, attempts: 3 })),
      ).rejects.toThrow("Telegram not configured for tenant");

      expect(mockReportExportUpdate).toHaveBeenCalledTimes(1);
      expect(mockReportExportUpdateMany).toHaveBeenCalledTimes(1);
      const failedUpdate = mockReportExportUpdateMany.mock.calls[0]?.[0] as {
        data: { status: string; errorMessage: string };
      };
      expect(failedUpdate.data.status).toBe("failed");
      expect(failedUpdate.data.errorMessage).toContain(
        "Telegram not configured for tenant",
      );
      // Never persists a ready row without a Telegram locator.
      const updates = mockReportExportUpdate.mock.calls.map(
        (c) => (c[0] as { data: { status?: string } }).data.status,
      );
      expect(updates).not.toContain("ready");
    });

    it("throws (job fails cleanly) for PDFs above the 20 MB Telegram getFile cap — no server-side write", async () => {
      const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x25);
      mockRenderPdfViaService.mockResolvedValueOnce(oversized);

      await expect(
        processPdfRender(makeJob({}, { attemptsMade: 2, attempts: 3 })),
      ).rejects.toThrow("exceeds Telegram's 20 MB getFile limit");

      expect(mockUploadDocumentToTelegram).not.toHaveBeenCalled();
      const failedUpdate = mockReportExportUpdateMany.mock.calls[0]?.[0] as {
        data: { status: string; errorMessage: string };
      };
      expect(failedUpdate.data.status).toBe("failed");
      expect(failedUpdate.data.errorMessage).toContain(
        "exceeds Telegram's 20 MB getFile limit",
      );
    });

    it("retries the Telegram send on transient failure, then persists the file_id (archive-er-assets retry pattern)", async () => {
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
