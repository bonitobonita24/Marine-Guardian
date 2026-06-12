import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { SyncNeededRescanJobPayload } from "../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    patrol: { findMany: vi.fn() },
  },
}));

vi.mock("../queues/area-rederive.queue", () => ({
  enqueueAreaRederive: vi.fn().mockResolvedValue("area-job-1"),
}));

vi.mock("../queues/patrol-track-materialize.queue", () => ({
  enqueuePatrolTrackMaterialize: vi.fn().mockResolvedValue("ptm-job-1"),
}));

import { platformPrisma } from "@marine-guardian/db";
import { validateTenantContext } from "../workers/base-worker";
import { processSyncNeededRescan } from "../processors/sync-needed-rescan.processor";
import { enqueueAreaRederive } from "../queues/area-rederive.queue";
import { enqueuePatrolTrackMaterialize } from "../queues/patrol-track-materialize.queue";

const mockPrisma = platformPrisma as unknown as {
  patrol: { findMany: ReturnType<typeof vi.fn> };
};

interface FindManyArg {
  where: { tenantId: string; syncNeeded: boolean; isDeleted: boolean };
  select: Record<string, boolean>;
  orderBy: { lastSyncedAt: string };
  take: number;
}

const mockValidateTenantContext = validateTenantContext as ReturnType<typeof vi.fn>;
const mockEnqueueAreaRederive = enqueueAreaRederive as ReturnType<typeof vi.fn>;
const mockEnqueuePatrolTrackMaterialize =
  enqueuePatrolTrackMaterialize as ReturnType<typeof vi.fn>;

function makeCandidate(id: string, lastSyncedAt: Date) {
  return { id, erPatrolId: `er-${id}`, lastSyncedAt };
}

function makeJob(overrides: Partial<SyncNeededRescanJobPayload> = {}) {
  return {
    id: "test-job-1",
    data: {
      tenantId: "tenant-1",
      userId: "system",
      ...overrides,
    },
  } as unknown as Job<SyncNeededRescanJobPayload>;
}

describe("processSyncNeededRescan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.patrol.findMany.mockResolvedValue([]);
  });

  it("validates tenant context before querying", async () => {
    await processSyncNeededRescan(makeJob());
    expect(mockValidateTenantContext).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
    });
  });

  it("selects only syncNeeded=true rows scoped to the tenant", async () => {
    await processSyncNeededRescan(makeJob());

    expect(mockPrisma.patrol.findMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.patrol.findMany.mock.calls[0]?.[0] as FindManyArg;
    expect(arg.where).toMatchObject({
      tenantId: "tenant-1",
      syncNeeded: true,
    });
  });

  it("excludes soft-deleted rows", async () => {
    await processSyncNeededRescan(makeJob());

    const arg = mockPrisma.patrol.findMany.mock.calls[0]?.[0] as FindManyArg;
    expect(arg.where.isDeleted).toBe(false);
  });

  it("bounds the candidate query at take:100 ordered by oldest sync first", async () => {
    await processSyncNeededRescan(makeJob());

    const arg = mockPrisma.patrol.findMany.mock.calls[0]?.[0] as FindManyArg;
    expect(arg.take).toBe(100);
    expect(arg.orderBy).toEqual({ lastSyncedAt: "asc" });
    expect(arg.select).toEqual({
      id: true,
      erPatrolId: true,
      lastSyncedAt: true,
    });
  });

  it("returns scanned and requeued counts", async () => {
    mockPrisma.patrol.findMany.mockResolvedValue([
      makeCandidate("p-1", new Date("2025-01-01T00:00:00Z")),
      makeCandidate("p-2", new Date("2025-01-02T00:00:00Z")),
      makeCandidate("p-3", new Date("2025-01-03T00:00:00Z")),
    ]);

    const result = await processSyncNeededRescan(makeJob());

    expect(result).toEqual({ scanned: 3, requeued: 3 });
  });

  it("re-enqueues area-rederive and patrol-track-materialize for each candidate", async () => {
    mockPrisma.patrol.findMany.mockResolvedValue([
      makeCandidate("p-1", new Date("2025-01-01T00:00:00Z")),
      makeCandidate("p-2", new Date("2025-01-02T00:00:00Z")),
    ]);

    await processSyncNeededRescan(makeJob({ userId: "system" }));

    expect(mockEnqueueAreaRederive).toHaveBeenCalledTimes(2);
    expect(mockEnqueuePatrolTrackMaterialize).toHaveBeenCalledTimes(2);
    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      entity: "patrol",
      id: "p-1",
    });
    expect(mockEnqueuePatrolTrackMaterialize).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      patrolId: "p-2",
    });
  });

  it("skips and counts only successfully re-enqueued rows when an enqueue throws", async () => {
    mockPrisma.patrol.findMany.mockResolvedValue([
      makeCandidate("p-1", new Date("2025-01-01T00:00:00Z")),
      makeCandidate("p-2", new Date("2025-01-02T00:00:00Z")),
    ]);
    mockEnqueueAreaRederive
      .mockResolvedValueOnce("area-job-1")
      .mockRejectedValueOnce(new Error("redis down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await processSyncNeededRescan(makeJob());

    expect(result).toEqual({ scanned: 2, requeued: 1 });
    errSpy.mockRestore();
  });
});
