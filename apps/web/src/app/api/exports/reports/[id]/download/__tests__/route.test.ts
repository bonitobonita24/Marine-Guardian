// 5.3c → Phase 4 S2 — /api/exports/reports/[id]/download Route Handler tests.
//
// Verifies the manual-auth download endpoint:
//   - 401 when no session
//   - 429 when rate-limited
//   - 404 when row missing (cross-tenant or never-created)
//   - 404 when status !== "ready"
//   - 404 when telegramFileId is null (strict Telegram-only — no MinIO
//     fallback exists any more; legacy rows without a telegramFileId 404)
//   - 200 with correct Content-Type + Content-Disposition + Content-Length,
//     fetched from Telegram
//   - EXPORT_DOWNLOAD AuditLog written with correct shape before the fetch
//   - 502 (never 500, never a fallback) when the Telegram fetch fails
//
// All tests use mocked prisma + telegram-storage + auth + rate-limit
// modules. The contract being tested is the handler's branching + audit
// shape + the command shapes it passes to its collaborators.

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

// Fully mock route-auth — `vi.importActual` would pull in next-auth via the
// `auth` import, which then tries to load `next/headers` (unavailable in the
// vitest node environment). The RouteAuthError class is replicated in-test.
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

function makeRouteArgs(
  id: string,
  disposition?: "inline",
): {
  req: Parameters<typeof GET>[0];
  ctx: Parameters<typeof GET>[1];
} {
  const url = new URL(`http://localhost/api/exports/reports/${id}/download`);
  if (disposition !== undefined) {
    url.searchParams.set("disposition", disposition);
  }
  return {
    // The route reads only `_req.nextUrl.searchParams`; a plain URL supplies it.
    req: { nextUrl: url } as unknown as Parameters<typeof GET>[0],
    ctx: { params: Promise.resolve({ id }) },
  };
}

const VALID_AUTH = {
  userId: "user-1",
  tenantId: "tenant-1",
  roles: ["coordinator"],
};

describe("GET /api/exports/reports/[id]/download", () => {
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
    mockRequireRouteAuth.mockRejectedValueOnce(
      new RouteAuthError(unauthorized),
    );

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
    // Tenant scope enforced via session.tenantId, not the URL.
    const call = mockPrisma.reportExport.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("missing-export");
    expect(call.where.tenantId).toBe("tenant-1");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when row exists but status !== 'ready'", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "rendering",
      telegramFileId: null,
      fileSizeBytes: null,
      reportType: "coverage",
      completedAt: null,
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when status=ready but telegramFileId is null (strict Telegram-only — no server-side fallback)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "ready",
      telegramFileId: null,
      fileSizeBytes: 1234,
      reportType: "coverage",
      completedAt: new Date(),
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Phase 4 S2 — strict Telegram-only storage + download.
  // ---------------------------------------------------------------------

  const TELEGRAM_ROW = {
    id: "export-tg",
    tenantId: "tenant-1",
    status: "ready",
    telegramFileId: "BQACAgUAAxkDAAII_file_id",
    fileSizeBytes: 9,
    reportType: "report_map",
    completedAt: new Date(Date.UTC(2026, 6, 3)), // 2026-07-03
  };

  it("on ready row: writes EXPORT_DOWNLOAD AuditLog with reportType + fileSizeBytes in changesJson", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: new TextEncoder().encode("%PDF-tele").buffer,
      filePath: "documents/file_1.pdf",
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
    expect(auditCall.data.action).toBe("EXPORT_DOWNLOAD");
    expect(auditCall.data.userId).toBe("user-1");
    expect(auditCall.data.tenantId).toBe("tenant-1");
    expect(auditCall.data.entityType).toBe("ReportExport");
    expect(auditCall.data.entityId).toBe("export-tg");
    expect(auditCall.data.changesJson.reportType).toBe("report_map");
    expect(auditCall.data.changesJson.fileSizeBytes).toBe(9);
  });

  it("on ready row: fetches bytes from Telegram and returns 200 with PDF headers", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    const pdfBytes = new TextEncoder().encode("%PDF-tele").buffer;
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: pdfBytes,
      filePath: "documents/file_1.pdf",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report_map-2026-07-03.pdf"',
    );
    // Content-Length reflects the ACTUAL fetched bytes, not row.fileSizeBytes.
    expect(res.headers.get("Content-Length")).toBe("9");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    expect(mockFetchTelegramFileBytes).toHaveBeenCalledTimes(1);
    const call = mockFetchTelegramFileBytes.mock.calls[0]?.[0] as {
      botToken: string;
      fileId: string;
    };
    expect(call.botToken).toBe("test-bot-token");
    expect(call.fileId).toBe("BQACAgUAAxkDAAII_file_id");
  });

  it("with ?disposition=inline: serves the same Telegram bytes inline (in-browser view) and audits as EXPORT_VIEW", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    const pdfBytes = new TextEncoder().encode("%PDF-tele").buffer;
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: pdfBytes,
      filePath: "documents/file_1.pdf",
    });

    const { req, ctx } = makeRouteArgs("export-tg", "inline");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    // inline (not attachment) — the browser renders the PDF instead of saving.
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="report_map-2026-07-03.pdf"',
    );
    // Still fetched from Telegram; no server-side copy involved.
    expect(mockFetchTelegramFileBytes).toHaveBeenCalledTimes(1);
    const auditCall = mockPrisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe("EXPORT_VIEW");
  });

  it("AuditLog write fires BEFORE the Telegram fetch", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: new TextEncoder().encode("%PDF-tele").buffer,
      filePath: "documents/file_1.pdf",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    await GET(req, ctx);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
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

  it("AuditLog is still written even when the Telegram fetch subsequently fails (attempt is recorded)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("never exposes telegramFileId in any response body", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    const body = await res.text();
    expect(body).not.toContain("BQACAgUAAxkDAAII_file_id");
  });

  it("legacy rows (telegramFileId null) 404 — there is no MinIO fallback path any more", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      ...TELEGRAM_ROW,
      telegramFileId: null,
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });
});
