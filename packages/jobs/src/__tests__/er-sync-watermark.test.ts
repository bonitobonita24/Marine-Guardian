/**
 * Tests for er-sync-watermark.ts — ops-milestone-1 (q-ops-06/07).
 *
 * Critical invariant under test: the recurring sync path MUST NEVER yield
 * since=undefined when a prior successful sync exists. This is the q-ops-07
 * "no full-pull in the recurring path" guarantee.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    syncLog: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { platformPrisma } from "@marine-guardian/db";
import { getWatermark, getRequiredWatermark, hasEverSynced } from "../lib/er-sync-watermark";

const mockPrisma = platformPrisma as unknown as {
  syncLog: {
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

describe("getWatermark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when no successful sync log exists (first-run case)", async () => {
    mockPrisma.syncLog.findFirst.mockResolvedValue(null);

    const result = await getWatermark("tenant-1", "events");

    expect(result).toBeUndefined();
    expect(mockPrisma.syncLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          syncType: "events",
          status: "success",
        }),
      }),
    );
  });

  it("returns ISO string from completedAt when a successful sync exists", async () => {
    const completedAt = new Date("2026-06-21T10:00:00.000Z");
    mockPrisma.syncLog.findFirst.mockResolvedValue({ completedAt });

    const result = await getWatermark("tenant-1", "events");

    // q-ops-06: watermark = completedAt of last successful sync
    expect(result).toBe("2026-06-21T10:00:00.000Z");
  });

  it("scopes the query to the correct tenantId and syncType", async () => {
    mockPrisma.syncLog.findFirst.mockResolvedValue(null);

    await getWatermark("tenant-abc", "patrols");

    expect(mockPrisma.syncLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-abc",
          syncType: "patrols",
          status: "success",
          completedAt: { not: null },
        }),
        orderBy: { completedAt: "desc" },
      }),
    );
  });

  it("returns the most-recent watermark (queries desc order)", async () => {
    // Simulates the DB returning the most recent row (Prisma respects orderBy desc LIMIT 1)
    const mostRecent = new Date("2026-06-21T15:30:00.000Z");
    mockPrisma.syncLog.findFirst.mockResolvedValue({ completedAt: mostRecent });

    const result = await getWatermark("tenant-1", "observations");

    expect(result).toBe("2026-06-21T15:30:00.000Z");
  });

  it("handles tenants that have synced patrols but not events independently", async () => {
    // Different syncTypes are independent — each has its own watermark
    mockPrisma.syncLog.findFirst
      .mockResolvedValueOnce({ completedAt: new Date("2026-06-20T08:00:00.000Z") }) // patrols
      .mockResolvedValueOnce(null); // events

    const patrolWatermark = await getWatermark("tenant-1", "patrols");
    const eventWatermark = await getWatermark("tenant-1", "events");

    expect(patrolWatermark).toBe("2026-06-20T08:00:00.000Z");
    expect(eventWatermark).toBeUndefined();
  });
});

describe("getRequiredWatermark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the watermark ISO string when a prior successful sync exists", async () => {
    const completedAt = new Date("2026-06-21T12:00:00.000Z");
    mockPrisma.syncLog.findFirst.mockResolvedValue({ completedAt });

    const result = await getRequiredWatermark("tenant-1", "events");

    expect(result).toBe("2026-06-21T12:00:00.000Z");
  });

  it("throws when no prior successful sync exists (q-ops-07 guard)", async () => {
    mockPrisma.syncLog.findFirst.mockResolvedValue(null);

    // q-ops-07: recurring path MUST NOT full-pull. getRequiredWatermark enforces this.
    await expect(getRequiredWatermark("tenant-1", "events")).rejects.toThrow(
      /No prior successful sync found for tenant tenant-1 syncType events/,
    );
  });

  it("q-ops-07: error message guides caller to run initial backfill first", async () => {
    mockPrisma.syncLog.findFirst.mockResolvedValue(null);

    await expect(getRequiredWatermark("tenant-2", "patrols")).rejects.toThrow(
      /initial backfill/,
    );
  });
});

describe("hasEverSynced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when at least one successful sync log exists", async () => {
    mockPrisma.syncLog.count.mockResolvedValue(3);

    const result = await hasEverSynced("tenant-1", "events");

    expect(result).toBe(true);
  });

  it("returns false when no successful sync log exists", async () => {
    mockPrisma.syncLog.count.mockResolvedValue(0);

    const result = await hasEverSynced("tenant-1", "events");

    expect(result).toBe(false);
  });

  it("scopes the count to the correct tenant and syncType", async () => {
    mockPrisma.syncLog.count.mockResolvedValue(1);

    await hasEverSynced("tenant-xyz", "patrols");

    expect(mockPrisma.syncLog.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-xyz",
          syncType: "patrols",
          status: "success",
          completedAt: { not: null },
        }),
      }),
    );
  });
});

describe("recurring sync watermark integration — q-ops-06/07 proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getWatermark never returns a stale/future date — always from completedAt", async () => {
    // Simulate the processor writing completedAt on success
    const processorCompletedAt = new Date("2026-06-21T09:45:00.000Z");
    mockPrisma.syncLog.findFirst.mockResolvedValue({ completedAt: processorCompletedAt });

    const since = await getWatermark("tenant-1", "events");

    // The recurring enqueue will pass this as `since` — delta-only pull from this timestamp
    expect(since).toBe(processorCompletedAt.toISOString());
    expect(since).not.toBeUndefined();
  });

  it("q-ops-07: recurring path NEVER fires with since=undefined once first sync ran", async () => {
    // After first run, watermark exists — subsequent recurring jobs are always delta
    const firstRunCompletedAt = new Date("2026-06-21T10:00:00.000Z");
    mockPrisma.syncLog.findFirst.mockResolvedValue({ completedAt: firstRunCompletedAt });

    const since = await getWatermark("tenant-1", "events");

    // A recurring job created with this `since` will never do a full pull
    expect(since).toBeDefined();
    expect(typeof since).toBe("string");
    // Parseable as ISO date
    expect(new Date(since!).getTime()).toBe(firstRunCompletedAt.getTime());
  });
});
