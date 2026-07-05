// V-pptx-export — /api/exports/reports/[id]/pptx Route Handler tests.
//
// Mirrors the PDF download route's test suite almost exactly (see
// ../../download/__tests__/route.test.ts) — same auth/rate-limit/404/502
// posture, applied to the pptx* columns instead of the PDF columns.
//
// Verifies:
//   - 401 when no session
//   - 429 when rate-limited
//   - 404 when row missing (cross-tenant or never-created)
//   - 404 when pptxStatus !== "ready"
//   - 404 when pptxTelegramFileId is null (defensive — ready implies non-null)
//   - 200 with correct Content-Type + Content-Disposition + Content-Length,
//     fetched from Telegram
//   - EXPORT_PPTX_DOWNLOAD AuditLog written with correct shape before the fetch
//   - 502 (never 500, never a fallback) when the Telegram fetch fails
//   - never exposes pptxTelegramFileId in any response body

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";

const {
  mockRequireRouteAuth,
  mockRateLimitCheck,
  mockPrisma,
  mockFetchTelegramFileBytes,
} = vi.hoisted(() => ({
  mockRequireRouteAuth: vi.fn(),
  mockRateLimitCheck: vi.fn(),
  mockPrisma: {
    reportExport: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockFetchTelegramFileBytes: vi.fn(),
}));

vi.mock("@/server/lib/route-auth", () => {
  class RouteAuthError extends Error {
    readonly response: unknown;
    constructor(response: unknown) {
      super("Route handler authentication failed");
      this.response = response;
    }
  }
  return {
    requireRouteAuth: mockRequireRouteAuth,
    RouteAuthError,
  };
});

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    upload: { check: mockRateLimitCheck },
  },
}));

vi.mock("@marine-guardian/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@marine-guardian/jobs/lib/telegram-storage", () => ({
  getTelegramBotToken: (): string => "test-bot-token",
  fetchTelegramFileBytes: (...args: unknown[]): unknown =>
    mockFetchTelegramFileBytes(...args),
}));

import { GET } from "../route";
import { RouteAuthError } from "@/server/lib/route-auth";

function makeRouteArgs(id: string): {
  req: Parameters<typeof GET>[0];
  ctx: Parameters<typeof GET>[1];
} {
  const url = new URL(`http://localhost/api/exports/reports/${id}/pptx`);
  return {
    req: { nextUrl: url } as unknown as Parameters<typeof GET>[0],
    ctx: { params: Promise.resolve({ id }) },
  };
}

const VALID_AUTH = {
  userId: "user-1",
  tenantId: "tenant-1",
  roles: ["coordinator"],
};

describe("GET /api/exports/reports/[id]/pptx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRouteAuth.mockResolvedValue(VALID_AUTH);
    mockRateLimitCheck.mockReturnValue(undefined);
    mockPrisma.reportExport.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("returns 401 when no session (requireRouteAuth throws RouteAuthError)", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockRequireRouteAuth.mockRejectedValueOnce(new RouteAuthError(unauthorized));

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.reportExport.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimitCheck.mockImplementationOnce(() => {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "rate limit" });
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(429);
    expect(mockPrisma.reportExport.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when ReportExport row is missing (cross-tenant or never created)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(null);

    const { req, ctx } = makeRouteArgs("missing-export");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    const call = mockPrisma.reportExport.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("missing-export");
    expect(call.where.tenantId).toBe("tenant-1");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when row exists but pptxStatus !== 'ready'", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      pptxStatus: "rendering",
      pptxTelegramFileId: null,
      pptxFileSizeBytes: null,
      reportType: "coverage",
      completedAt: null,
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when pptxStatus=ready but pptxTelegramFileId is null (defensive)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      pptxStatus: "ready",
      pptxTelegramFileId: null,
      pptxFileSizeBytes: 1234,
      reportType: "coverage",
      completedAt: new Date(),
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  const TELEGRAM_ROW = {
    id: "export-tg",
    tenantId: "tenant-1",
    pptxStatus: "ready",
    pptxTelegramFileId: "BQACAgUAAxkDAAII_pptx_file_id",
    pptxFileSizeBytes: 9,
    reportType: "report_map",
    completedAt: new Date(Date.UTC(2026, 6, 3)), // 2026-07-03
  };

  it("on ready row: writes EXPORT_PPTX_DOWNLOAD AuditLog with reportType + fileSizeBytes in changesJson", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: new TextEncoder().encode("PK-pptx").buffer,
      filePath: "documents/file_1.pptx",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    await GET(req, ctx);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = mockPrisma.auditLog.create.mock.calls[0]?.[0] as {
      data: {
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
        changesJson: { reportType: string; fileSizeBytes: number };
      };
    };
    expect(auditCall.data.action).toBe("EXPORT_PPTX_DOWNLOAD");
    expect(auditCall.data.userId).toBe("user-1");
    expect(auditCall.data.tenantId).toBe("tenant-1");
    expect(auditCall.data.entityType).toBe("ReportExport");
    expect(auditCall.data.entityId).toBe("export-tg");
    expect(auditCall.data.changesJson.reportType).toBe("report_map");
    expect(auditCall.data.changesJson.fileSizeBytes).toBe(9);
  });

  it("on ready row: fetches bytes from Telegram and returns 200 with PPTX headers", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    const pptxBytes = new TextEncoder().encode("PK-pptx").buffer;
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: pptxBytes,
      filePath: "documents/file_1.pptx",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report_map-2026-07-03.pptx"',
    );
    expect(res.headers.get("Content-Length")).toBe("7");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    expect(mockFetchTelegramFileBytes).toHaveBeenCalledTimes(1);
    const call = mockFetchTelegramFileBytes.mock.calls[0]?.[0] as {
      botToken: string;
      fileId: string;
    };
    expect(call.botToken).toBe("test-bot-token");
    expect(call.fileId).toBe("BQACAgUAAxkDAAII_pptx_file_id");
  });

  it("AuditLog write fires BEFORE the Telegram fetch", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: new TextEncoder().encode("PK-pptx").buffer,
      filePath: "documents/file_1.pptx",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    await GET(req, ctx);

    const auditOrder =
      mockPrisma.auditLog.create.mock.invocationCallOrder[0] ?? Infinity;
    const fetchOrder =
      mockFetchTelegramFileBytes.mock.invocationCallOrder[0] ?? -Infinity;
    expect(auditOrder).toBeLessThan(fetchOrder);
  });

  it("returns a clean 502 (never 500, never a fallback) when the Telegram fetch fails", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockRejectedValueOnce(
      new Error("Telegram getFile failed: file is too big"),
    );

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
  });

  it("never exposes pptxTelegramFileId in any response body", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    const body = await res.text();
    expect(body).not.toContain("BQACAgUAAxkDAAII_pptx_file_id");
  });
});
