// V-pptx-export — pptx-render processor tests.
//
// Verifies the BullMQ job handler for the ON-DEMAND "Render to PowerPoint"
// feature:
//  (1) validates tenant context first,
//  (2) loads the ReportExport row + tenant scoped by (id, tenantId),
//  (3) transitions pptxStatus → "rendering" before doing any work,
//  (4) requires the source PDF to already be status=ready + telegramFileId
//      non-null — refuses to convert an unfinished/failed PDF,
//  (5) fetches the PDF bytes from Telegram, converts via renderPdfPagesToPptx,
//  (6) SOLE store is Telegram (same posture as pdf-render) — uploads the
//      .pptx and persists pptxStatus=ready + pptxTelegramFileId +
//      pptxFileSizeBytes,
//  (7) on failure (transient, not last attempt): re-throws WITHOUT flipping
//      pptxStatus=failed,
//  (8) on failure (last attempt exhausted): pptxStatus=failed + pptxErrorMessage,
//  (9) the 20 MB Telegram getFile cap applies to the .pptx output the same
//      way it applies to the PDF.

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

const mockFetchTelegramFileBytes = vi.fn();
const mockUploadDocumentToTelegram = vi.fn();
const mockGetTelegramBotToken = vi.fn();
vi.mock("../../lib/telegram-storage", () => ({
  getTelegramBotToken: (...args: unknown[]): unknown =>
    mockGetTelegramBotToken(...args),
  fetchTelegramFileBytes: (...args: unknown[]): unknown =>
    mockFetchTelegramFileBytes(...args),
  uploadDocumentToTelegram: (...args: unknown[]): unknown =>
    mockUploadDocumentToTelegram(...args),
}));

const mockRenderPdfPagesToPptx = vi.fn();
vi.mock("../../lib/pdf-to-pptx", () => ({
  renderPdfPagesToPptx: (...args: unknown[]): unknown =>
    mockRenderPdfPagesToPptx(...args),
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

const fakePdfBytesBuffer = new TextEncoder().encode("%PDF-1.4 fake").buffer;
const fakePptxBuffer = Buffer.from("PK-fake-pptx-zip-bytes");

describe("processPptxRender", () => {
  const ORIGINAL_TELEGRAM_ENV = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_DEFAULT_CHANNEL_ID: process.env.TELEGRAM_DEFAULT_CHANNEL_ID,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    delete process.env.TELEGRAM_DEFAULT_CHANNEL_ID;

    mockReportExportFindFirstOrThrow.mockResolvedValue({
      id: "export-1",
      tenantId: "tenant-1",
      reportType: "coverage",
      status: "ready",
      telegramFileId: "tg-pdf-file",
    });
    mockTenantFindUniqueOrThrow.mockResolvedValue({
      id: "tenant-1",
      slug: "marine-guardian-sample",
      telegramChannelId: "-1003816125998",
    });
    mockReportExportUpdate.mockResolvedValue({});
    mockGetTelegramBotToken.mockReturnValue("test-bot-token");
    mockFetchTelegramFileBytes.mockResolvedValue({
      bytes: fakePdfBytesBuffer,
      filePath: "documents/file_1.pdf",
    });
    mockRenderPdfPagesToPptx.mockResolvedValue(fakePptxBuffer);
    mockUploadDocumentToTelegram.mockResolvedValue({
      messageId: 99,
      fileId: "tg-pptx-file-abc",
    });
  });

  afterAll(() => {
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
    await processPptxRender(makeJob());
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
    await processPptxRender(makeJob({ exportId: "export-99", tenantId: "tenant-x" }));
    const call = mockReportExportFindFirstOrThrow.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("export-99");
    expect(call.where.tenantId).toBe("tenant-x");
  });

  it("transitions pptxStatus to 'rendering' BEFORE fetching PDF bytes", async () => {
    await processPptxRender(makeJob());
    const firstUpdateCall = mockReportExportUpdate.mock.calls[0]?.[0] as {
      data: { pptxStatus: string };
    };
    expect(firstUpdateCall.data.pptxStatus).toBe("rendering");
    expect(mockReportExportUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockFetchTelegramFileBytes.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("refuses to convert when the source PDF is not ready (queued/rendering) — throws, no Telegram fetch", async () => {
    mockReportExportFindFirstOrThrow.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      reportType: "coverage",
      status: "rendering",
      telegramFileId: null,
    });

    await expect(
      processPptxRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("Source PDF is not ready");
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  it("refuses to convert when the PDF is ready but has no telegramFileId", async () => {
    mockReportExportFindFirstOrThrow.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      reportType: "coverage",
      status: "ready",
      telegramFileId: null,
    });

    await expect(processPptxRender(makeJob())).rejects.toThrow(
      "Source PDF is not ready",
    );
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  it("on success: fetches the PDF from Telegram, converts via renderPdfPagesToPptx, uploads the result, and persists pptxStatus=ready", async () => {
    const result = await processPptxRender(makeJob());

    expect(mockFetchTelegramFileBytes).toHaveBeenCalledWith({
      botToken: "test-bot-token",
      fileId: "tg-pdf-file",
    });
    expect(mockRenderPdfPagesToPptx).toHaveBeenCalledTimes(1);
    const pdfArg = mockRenderPdfPagesToPptx.mock.calls[0]?.[0] as Uint8Array;
    expect(pdfArg).toBeInstanceOf(Uint8Array);

    expect(mockUploadDocumentToTelegram).toHaveBeenCalledTimes(1);
    const uploadCall = mockUploadDocumentToTelegram.mock.calls[0]?.[0] as {
      botToken: string;
      chatId: string;
      filename: string;
      mimeType: string;
    };
    expect(uploadCall.botToken).toBe("test-bot-token");
    expect(uploadCall.chatId).toBe("-1003816125998");
    expect(uploadCall.filename).toBe("coverage-export-1.pptx");
    expect(uploadCall.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );

    expect(mockReportExportUpdate).toHaveBeenCalledTimes(2);
    const finalUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
      data: {
        pptxStatus: string;
        pptxTelegramFileId: string;
        pptxFileSizeBytes: number;
      };
    };
    expect(finalUpdate.data.pptxStatus).toBe("ready");
    expect(finalUpdate.data.pptxTelegramFileId).toBe("tg-pptx-file-abc");
    expect(finalUpdate.data.pptxFileSizeBytes).toBe(fakePptxBuffer.length);

    expect(result.status).toBe("ready");
    expect(result.telegramFileId).toBe("tg-pptx-file-abc");
  });

  it("on transient failure (NOT last attempt): re-throws WITHOUT flipping pptxStatus=failed", async () => {
    mockRenderPdfPagesToPptx.mockRejectedValueOnce(new Error("rasterize failed"));

    await expect(
      processPptxRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("rasterize failed");

    const statuses = mockReportExportUpdate.mock.calls.map(
      (c) => (c[0] as { data: { pptxStatus?: string } }).data.pptxStatus,
    );
    expect(statuses).toEqual(["rendering"]);
    expect(statuses).not.toContain("failed");
  });

  it("on final failure (last attempt exhausted): pptxStatus=failed + pptxErrorMessage + re-throws", async () => {
    mockUploadDocumentToTelegram.mockRejectedValue(
      new Error("Telegram sendDocument failed: 500"),
    );

    vi.useFakeTimers();
    try {
      const pending = processPptxRender(
        makeJob({}, { attemptsMade: 2, attempts: 3 }),
      );
      const assertion = expect(pending).rejects.toThrow("500");
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }

    expect(mockReportExportUpdate).toHaveBeenCalledTimes(2);
    const failedUpdate = mockReportExportUpdate.mock.calls[1]?.[0] as {
      data: { pptxStatus: string; pptxErrorMessage: string };
    };
    expect(failedUpdate.data.pptxStatus).toBe("failed");
    expect(failedUpdate.data.pptxErrorMessage).toContain("500");
  });

  it("throws (job fails cleanly) when Telegram is unconfigured for the tenant", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    mockTenantFindUniqueOrThrow.mockResolvedValue({
      id: "tenant-1",
      slug: "marine-guardian-sample",
      telegramChannelId: null,
    });
    mockGetTelegramBotToken.mockImplementation(() => {
      throw new Error("TELEGRAM_BOT_TOKEN environment variable is not set.");
    });

    await expect(
      processPptxRender(makeJob({}, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow("TELEGRAM_BOT_TOKEN");
    expect(mockUploadDocumentToTelegram).not.toHaveBeenCalled();
  });

  it("throws when the rendered PPTX exceeds Telegram's 20 MB getFile cap", async () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0x50);
    mockRenderPdfPagesToPptx.mockResolvedValueOnce(oversized);

    await expect(
      processPptxRender(makeJob({}, { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow("exceeds Telegram's 20 MB getFile limit");
    expect(mockUploadDocumentToTelegram).not.toHaveBeenCalled();
  });

  it("throws when Telegram returns an empty file_id (never persists a ready row without a locator)", async () => {
    mockUploadDocumentToTelegram.mockResolvedValue({ messageId: 1, fileId: "" });

    await expect(processPptxRender(makeJob())).rejects.toThrow(
      "no document file_id",
    );
    const statuses = mockReportExportUpdate.mock.calls.map(
      (c) => (c[0] as { data: { pptxStatus?: string } }).data.pptxStatus,
    );
    expect(statuses).not.toContain("ready");
  });
});
