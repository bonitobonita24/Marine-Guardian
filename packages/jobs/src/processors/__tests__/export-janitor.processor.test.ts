// Export-janitor processor tests.
//
// The janitor is the DELETION AUTHORITY for ephemeral report exports, so the
// two things that matter most here are:
//  (1) expired rows and their objects actually go away — including when a
//      single delete fails, which must not abort the rest of the sweep, and
//  (2) THE ORPHAN SWEEP NEVER TOUCHES PERMANENT CONTENT. The exports bucket
//      also holds template logos (`logos/…`) and CMS media (`cms/…`); an
//      unfiltered age sweep would destroy every tenant's logos. Those
//      negative cases are the highest-value assertions in this file.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { ExportJanitorJobPayload } from "../../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    reportExport: {
      findMany: (...args: unknown[]): unknown => mockFindMany(...args),
      deleteMany: (...args: unknown[]): unknown => mockDeleteMany(...args),
    },
  },
}));

const mockDeleteObject = vi.fn();
const mockListExpiredObjectKeys = vi.fn();

vi.mock("@marine-guardian/storage", () => ({
  getExportsBucketName: (): string => "marine-guardian-test-exports",
  // Real-shaped, not a stub — the key assertions must pin the produced string.
  buildPptxExportKey: (tenantId: string, exportId: string, at: Date): string =>
    `${tenantId}/${String(at.getUTCFullYear())}/${String(
      at.getUTCMonth() + 1,
    ).padStart(2, "0")}/${exportId}.pptx`,
  deleteObject: (...args: unknown[]): unknown => mockDeleteObject(...args),
  listExpiredObjectKeys: (...args: unknown[]): unknown =>
    mockListExpiredObjectKeys(...args),
}));

import {
  EXPORT_TTL_MS,
  isEphemeralExportKey,
  processExportJanitor,
} from "../export-janitor.processor";

const BUCKET = "marine-guardian-test-exports";

function makeJob(): Job<ExportJanitorJobPayload> {
  return {
    id: "janitor-job-1",
    data: { tenantId: "__platform__", userId: "__system__" },
  } as unknown as Job<ExportJanitorJobPayload>;
}

interface RowShape {
  id: string;
  tenantId: string;
  filePath: string | null;
  createdAt: Date;
}

function expiredRow(overrides: Partial<RowShape> = {}): RowShape {
  return {
    id: "export-1",
    tenantId: "tenant-1",
    filePath: "tenant-1/2026/07/export-1.pdf",
    // Comfortably older than the TTL, and mid-month so the pptx probe
    // collapses to a single candidate key.
    createdAt: new Date("2026-07-15T10:00:00.000Z"),
    ...overrides,
  };
}

function deletedKeys(): string[] {
  return mockDeleteObject.mock.calls.map(
    (call) => (call[0] as { key: string }).key,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFindMany.mockResolvedValue([]);
  mockDeleteMany.mockResolvedValue({ count: 1 });
  mockDeleteObject.mockResolvedValue(undefined);
  mockListExpiredObjectKeys.mockResolvedValue([]);
});

describe("isEphemeralExportKey", () => {
  it("accepts a valid pdf export key", () => {
    expect(isEphemeralExportKey("tenant-1/2026/07/export-1.pdf")).toBe(true);
  });

  it("accepts a valid pptx export key", () => {
    expect(isEphemeralExportKey("tenant-1/2026/07/export-1.pptx")).toBe(true);
  });

  it("accepts cuid-shaped tenant and export ids", () => {
    expect(
      isEphemeralExportKey(
        "cmoruubw20000gmx3jx7zudmy/2026/12/clx9a8b7c6d5e4f3g2h1.pdf",
      ),
    ).toBe(true);
  });

  it("REJECTS a template logo key", () => {
    expect(isEphemeralExportKey("logos/tenant-1/template-1.png")).toBe(false);
  });

  it("REJECTS a logo key even with an export-ish extension", () => {
    expect(isEphemeralExportKey("logos/tenant-1/2026/07/thing.pdf")).toBe(
      false,
    );
  });

  it("REJECTS a CMS media key", () => {
    expect(isEphemeralExportKey("cms/global/media-1.png")).toBe(false);
  });

  it("REJECTS a tenant-scoped CMS media key", () => {
    expect(isEphemeralExportKey("cms/tenant-1/media-1.jpg")).toBe(false);
  });

  it("rejects arbitrary junk", () => {
    for (const key of [
      "",
      "random.txt",
      "tenant-1/export-1.pdf",
      "tenant-1/26/07/export-1.pdf",
      "tenant-1/2026/7/export-1.pdf",
      "tenant-1/2026/07/export-1.png",
      "tenant-1/2026/07/nested/export-1.pdf",
      "tenant-1/2026/07/export-1.pdf.bak",
    ]) {
      expect(isEphemeralExportKey(key)).toBe(false);
    }
  });
});

describe("processExportJanitor — sweep A (expired rows)", () => {
  it("queries with a cutoff of now - EXPORT_TTL_MS and a bounded page", async () => {
    const before = Date.now();
    await processExportJanitor(makeJob());
    const after = Date.now();

    const args = mockFindMany.mock.calls[0]?.[0] as {
      where: { createdAt: { lt: Date } };
      take: number;
    };
    const cutoff = args.where.createdAt.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - EXPORT_TTL_MS);
    expect(cutoff).toBeLessThanOrEqual(after - EXPORT_TTL_MS);
    expect(args.take).toBe(200);
  });

  it("deletes both the stored pdf key and the derived pptx key, then the row", async () => {
    mockFindMany.mockResolvedValue([expiredRow()]);

    const result = await processExportJanitor(makeJob());

    expect(deletedKeys()).toEqual([
      "tenant-1/2026/07/export-1.pdf",
      "tenant-1/2026/07/export-1.pptx",
    ]);
    expect(mockDeleteObject).toHaveBeenCalledWith({
      bucket: BUCKET,
      key: "tenant-1/2026/07/export-1.pdf",
    });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "export-1" } });
    expect(result.rowsDeleted).toBe(1);
    expect(result.objectsDeleted).toBe(2);
  });

  it("uses the STORED filePath verbatim rather than recomputing it", async () => {
    // A pdf uploaded just after a month boundary keeps its August prefix even
    // though the row was created in July — reading row.filePath must not
    // regress into a createdAt-derived recompute.
    mockFindMany.mockResolvedValue([
      expiredRow({ filePath: "tenant-1/2026/08/export-1.pdf" }),
    ]);

    await processExportJanitor(makeJob());

    expect(deletedKeys()).toContain("tenant-1/2026/08/export-1.pdf");
  });

  it("still attempts the pptx key and deletes the row when filePath is null", async () => {
    mockFindMany.mockResolvedValue([expiredRow({ filePath: null })]);

    const result = await processExportJanitor(makeJob());

    expect(deletedKeys()).toEqual(["tenant-1/2026/07/export-1.pptx"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "export-1" } });
    expect(result.rowsDeleted).toBe(1);
    expect(result.objectsDeleted).toBe(1);
  });

  it("probes the next month's prefix for a row created at a month boundary", async () => {
    mockFindMany.mockResolvedValue([
      expiredRow({
        filePath: null,
        createdAt: new Date("2026-07-31T23:59:00.000Z"),
      }),
    ]);

    await processExportJanitor(makeJob());

    expect(deletedKeys()).toEqual([
      "tenant-1/2026/07/export-1.pptx",
      "tenant-1/2026/08/export-1.pptx",
    ]);
  });

  it("does NOT sweep rows inside the TTL — they are simply not selected", async () => {
    // The processor delegates the age filter to the query, so the contract is
    // that the cutoff is exact and nothing outside the returned page is touched.
    mockFindMany.mockResolvedValue([]);

    const result = await processExportJanitor(makeJob());

    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(result.rowsDeleted).toBe(0);
  });

  it("logs and continues when a deleteObject fails — later rows still swept", async () => {
    mockFindMany.mockResolvedValue([
      expiredRow({ id: "export-1", filePath: "tenant-1/2026/07/export-1.pdf" }),
      expiredRow({ id: "export-2", filePath: "tenant-1/2026/07/export-2.pdf" }),
    ]);
    mockDeleteObject.mockImplementation((input: { key: string }) =>
      input.key === "tenant-1/2026/07/export-1.pdf"
        ? Promise.reject(new Error("minio exploded"))
        : Promise.resolve(undefined),
    );

    const result = await processExportJanitor(makeJob());

    // Both rows still deleted, and the failed key did not stop the run.
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "export-1" } });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "export-2" } });
    expect(result.rowsDeleted).toBe(2);
    // 4 attempts, 1 failed.
    expect(result.objectsDeleted).toBe(3);
    expect(console.warn).toHaveBeenCalled();
  });

  it("logs and continues when a row delete fails", async () => {
    mockFindMany.mockResolvedValue([
      expiredRow({ id: "export-1" }),
      expiredRow({ id: "export-2" }),
    ]);
    mockDeleteMany.mockImplementation((args: { where: { id: string } }) =>
      args.where.id === "export-1"
        ? Promise.reject(new Error("db down"))
        : Promise.resolve({ count: 1 }),
    );

    const result = await processExportJanitor(makeJob());

    expect(result.rowsDeleted).toBe(1);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("processExportJanitor — sweep B (orphaned objects)", () => {
  it("deletes matching export keys that outlived their row", async () => {
    mockListExpiredObjectKeys.mockResolvedValue([
      "tenant-1/2026/07/orphan-1.pdf",
      "tenant-2/2026/07/orphan-2.pptx",
    ]);

    const result = await processExportJanitor(makeJob());

    expect(deletedKeys()).toEqual([
      "tenant-1/2026/07/orphan-1.pdf",
      "tenant-2/2026/07/orphan-2.pptx",
    ]);
    expect(result.orphansDeleted).toBe(2);
  });

  it("lists with the exports bucket, the TTL cutoff and a 1000 limit", async () => {
    await processExportJanitor(makeJob());

    const args = mockListExpiredObjectKeys.mock.calls[0]?.[0] as {
      bucket: string;
      olderThan: Date;
      limit: number;
    };
    expect(args.bucket).toBe(BUCKET);
    expect(args.limit).toBe(1000);
    expect(Date.now() - args.olderThan.getTime()).toBeGreaterThanOrEqual(
      EXPORT_TTL_MS,
    );
  });

  it("does NOT delete a logos/ key", async () => {
    mockListExpiredObjectKeys.mockResolvedValue([
      "logos/tenant-1/template-1.png",
      "logos/tenant-2/template-2.svg",
    ]);

    const result = await processExportJanitor(makeJob());

    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(result.orphansDeleted).toBe(0);
  });

  it("does NOT delete a CMS media key", async () => {
    mockListExpiredObjectKeys.mockResolvedValue([
      "cms/global/media-1.png",
      "cms/tenant-1/media-2.jpg",
    ]);

    const result = await processExportJanitor(makeJob());

    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(result.orphansDeleted).toBe(0);
  });

  it("deletes only the export key from a mixed listing", async () => {
    mockListExpiredObjectKeys.mockResolvedValue([
      "logos/tenant-1/template-1.png",
      "tenant-1/2026/07/orphan-1.pdf",
      "cms/global/media-1.png",
      "some-random-junk.txt",
    ]);

    const result = await processExportJanitor(makeJob());

    expect(deletedKeys()).toEqual(["tenant-1/2026/07/orphan-1.pdf"]);
    expect(result.orphansDeleted).toBe(1);
  });

  it("survives a listExpiredObjectKeys failure without failing the job", async () => {
    mockFindMany.mockResolvedValue([expiredRow()]);
    mockListExpiredObjectKeys.mockRejectedValue(new Error("list failed"));

    const result = await processExportJanitor(makeJob());

    // Sweep A still counted; sweep B degraded to zero.
    expect(result.rowsDeleted).toBe(1);
    expect(result.orphansDeleted).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it("does not count an orphan whose delete failed", async () => {
    mockListExpiredObjectKeys.mockResolvedValue([
      "tenant-1/2026/07/orphan-1.pdf",
      "tenant-1/2026/07/orphan-2.pdf",
    ]);
    mockDeleteObject.mockImplementation((input: { key: string }) =>
      input.key === "tenant-1/2026/07/orphan-1.pdf"
        ? Promise.reject(new Error("nope"))
        : Promise.resolve(undefined),
    );

    const result = await processExportJanitor(makeJob());

    expect(result.orphansDeleted).toBe(1);
  });
});
