import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/server/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    alertRule: { findMany: vi.fn() },
    tenant: { findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@react-pdf/renderer", async () => {
  const actual = await vi.importActual<typeof import("@react-pdf/renderer")>(
    "@react-pdf/renderer",
  );
  return {
    // Spread copies the React components (Document, Page, Text, View,
    // StyleSheet) that export-pdf.tsx needs at module-load time; only
    // renderToBuffer is overridden with a stub to avoid heavy PDF
    // rendering in tests.
    // eslint-disable-next-line @typescript-eslint/no-misused-spread
    ...actual,
    renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\n stub")),
  };
});

import { auth } from "@/server/auth";
import { prisma } from "@marine-guardian/db";
import { GET } from "../route";

type MockFn = ReturnType<typeof vi.fn>;
const mockedAuth = auth as unknown as MockFn;
const mockedFindMany = prisma.alertRule.findMany as unknown as MockFn;
const mockedTenantFind = prisma.tenant.findUniqueOrThrow as unknown as MockFn;
const mockedAuditCreate = prisma.auditLog.create as unknown as MockFn;

interface AuditCreateArg {
  data: {
    action: string;
    entityType: string;
    entityId: string;
    changesJson: { format: string; rowCount: number };
  };
}

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

function authedSession() {
  return {
    user: {
      id: "u1",
      tenantId: "t1",
      roles: ["admin"],
      email: "test@example.com",
      name: "Test User",
    },
    expires: "2099-01-01",
  };
}

function makeAlertRule(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Rule ${id}`,
    conditionJson: { priority: 200, op: "gte" },
    notificationChannels: ["in_app", "email"],
    isActive: true,
    createdBy: "u1",
    createdAt: new Date("2026-05-02T00:00:00Z"),
    updatedAt: new Date("2026-05-03T00:00:00Z"),
    creator: { id: "u1", fullName: "Ranger One" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedTenantFind.mockResolvedValue({ slug: "test-tenant", name: "Test Tenant" });
});

describe("GET /api/exports/alert-rules", () => {
  it("returns CSV with BOM, text/csv content-type, and tenant-scoped findMany", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    mockedFindMany.mockResolvedValue([
      makeAlertRule("r1"),
      makeAlertRule("r2"),
    ]);

    const req = new NextRequest(
      "http://localhost/api/exports/alert-rules?format=csv",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment.*\.csv/);

    // Verify the UTF-8 BOM byte sequence on the wire (Response.text() strips
    // the BOM during decoding, so check the raw ArrayBuffer).
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const bodyText = new TextDecoder("utf-8").decode(buf);
    expect(bodyText).toContain("Rule r1");
    // Channels joined with ", " (column formatter for notificationChannels[]).
    expect(bodyText).toContain("in_app, email");
    // conditionJson stringified as JSON (opaque Json column — JSON.stringify
    // is the honest representation; downstream parses if needed).
    expect(bodyText).toContain('{""priority"":200');

    expect(mockedFindMany).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: "t1" }) }),
    );
  });

  it("returns PDF with application/pdf content-type", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    mockedFindMany.mockResolvedValue([makeAlertRule("r1")]);

    const req = new NextRequest(
      "http://localhost/api/exports/alert-rules?format=pdf",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/pdf/);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment.*\.pdf/);
  });

  it("returns 401 when there is no session", async () => {
    mockedAuth.mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost/api/exports/alert-rules?format=csv",
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("returns 413 when result set exceeds 10000 rows", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    const tooMany = Array.from({ length: 10001 }, (_, i) =>
      makeAlertRule(`r${String(i)}`),
    );
    mockedFindMany.mockResolvedValue(tooMany);

    const req = new NextRequest(
      "http://localhost/api/exports/alert-rules?format=csv",
    );
    const res = await GET(req);

    expect(res.status).toBe(413);
    expect(mockedAuditCreate).not.toHaveBeenCalled();
  });

  it("writes a DATA_EXPORT AuditLog row with sha256 filterHash after success", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    mockedFindMany.mockResolvedValue([
      makeAlertRule("r1"),
      makeAlertRule("r2"),
      makeAlertRule("r3"),
    ]);

    const req = new NextRequest(
      "http://localhost/api/exports/alert-rules?format=csv&isActive=true",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(mockedAuditCreate).toHaveBeenCalledOnce();
    const mock = mockedAuditCreate as unknown as {
      mock: { calls: AuditCreateArg[][] };
    };
    const arg = mock.mock.calls[0]?.[0];
    expect(arg?.data.action).toBe("DATA_EXPORT");
    expect(arg?.data.entityType).toBe("alert-rules");
    expect(arg?.data.entityId).toMatch(/^[a-f0-9]{64}$/);
    expect(arg?.data.changesJson).toEqual({ format: "csv", rowCount: 3 });
  });

  it("propagates isActive filter into prisma.where", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    mockedFindMany.mockResolvedValue([]);

    const req = new NextRequest(
      "http://localhost/api/exports/alert-rules?format=csv&isActive=false",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(mockedFindMany).toHaveBeenCalledWith(
      partial({
        where: partial({
          tenantId: "t1",
          isActive: false,
        }),
      }),
    );
  });
});
