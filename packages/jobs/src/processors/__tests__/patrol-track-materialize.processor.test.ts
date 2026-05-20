// 5.2b — patrol-track-materialize processor tests.
//
// Verifies the BullMQ job handler:
//  (1) calls validateTenantContext on the payload (rejects empty tenantId/userId),
//  (2) delegates to materializePatrolTrack with the correct positional args
//      (prisma, patrolId) — the prisma instance is the module-level
//      platformPrisma cast, NOT the job payload,
//  (3) returns the helper's MaterializationResult so BullMQ persists it as
//      the job result (5.2c admin UI surfaces skipReason from this).
//
// Mocks materializePatrolTrack directly via vi.mock("../../lib/patrol-track-
// materialization"). The helper itself is exhaustively tested in
// packages/jobs/src/lib/__tests__/patrol-track-materialization.test.ts —
// this file only verifies the processor wires the helper correctly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { PatrolTrackMaterializeJobPayload } from "../../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: { __marker: "platformPrisma-mock" },
}));

vi.mock("../../lib/patrol-track-materialization", () => ({
  materializePatrolTrack: vi.fn(),
}));

import { processPatrolTrackMaterialize } from "../patrol-track-materialize.processor";
import { validateTenantContext } from "../../workers/base-worker";
import { materializePatrolTrack } from "../../lib/patrol-track-materialization";
import { platformPrisma } from "@marine-guardian/db";

const mockMaterialize = materializePatrolTrack as ReturnType<typeof vi.fn>;
const mockValidate = validateTenantContext as ReturnType<typeof vi.fn>;

function makeJob(
  overrides: Partial<PatrolTrackMaterializeJobPayload> = {},
): Job<PatrolTrackMaterializeJobPayload> {
  return {
    id: "test-job-1",
    data: {
      tenantId: "tenant-1",
      userId: "user-1",
      patrolId: "patrol-1",
      ...overrides,
    },
  } as unknown as Job<PatrolTrackMaterializeJobPayload>;
}

describe("processPatrolTrackMaterialize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaterialize.mockResolvedValue({
      patrolTrackId: "pt-1",
      pointCount: 42,
      hasTimestamps: true,
      lastTrackTime: new Date("2026-05-20T12:00:00Z"),
      patrolEnded: false,
      skipped: false,
    });
  });

  it("calls validateTenantContext with the job payload before doing any work", async () => {
    await processPatrolTrackMaterialize(makeJob());
    expect(mockValidate).toHaveBeenCalledTimes(1);
    expect(mockValidate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      patrolId: "patrol-1",
    });
  });

  it("delegates to materializePatrolTrack with positional args (prisma, patrolId)", async () => {
    await processPatrolTrackMaterialize(makeJob({ patrolId: "patrol-99" }));
    expect(mockMaterialize).toHaveBeenCalledTimes(1);
    expect(mockMaterialize).toHaveBeenCalledWith(platformPrisma, "patrol-99");
  });

  it("returns the result from materializePatrolTrack for BullMQ result storage", async () => {
    const expected = {
      patrolTrackId: "pt-7",
      pointCount: 128,
      hasTimestamps: true,
      lastTrackTime: new Date("2026-05-20T15:30:00Z"),
      patrolEnded: true,
      skipped: false,
    };
    mockMaterialize.mockResolvedValueOnce(expected);
    const result = await processPatrolTrackMaterialize(makeJob());
    expect(result).toEqual(expected);
  });

  it("returns skipped result with skipReason when materializePatrolTrack short-circuits (no_credentials)", async () => {
    const skipped = {
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded: false,
      skipped: true,
      skipReason: "no_credentials" as const,
    };
    mockMaterialize.mockResolvedValueOnce(skipped);
    const result = await processPatrolTrackMaterialize(makeJob());
    expect(result).toEqual(skipped);
  });

  it("returns skipped result with skipReason='no_leader' when patrol segment has no leader", async () => {
    const skipped = {
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded: false,
      skipped: true,
      skipReason: "no_leader" as const,
    };
    mockMaterialize.mockResolvedValueOnce(skipped);
    const result = await processPatrolTrackMaterialize(makeJob());
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_leader");
  });

  it("returns skipped result with skipReason='no_segment' when patrol has no segments", async () => {
    const skipped = {
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded: false,
      skipped: true,
      skipReason: "no_segment" as const,
    };
    mockMaterialize.mockResolvedValueOnce(skipped);
    const result = await processPatrolTrackMaterialize(makeJob());
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_segment");
  });

  it("propagates exceptions from materializePatrolTrack (no try/catch)", async () => {
    mockMaterialize.mockRejectedValueOnce(
      new Error("EarthRanger fetch 502 Bad Gateway"),
    );
    await expect(processPatrolTrackMaterialize(makeJob())).rejects.toThrow(
      "EarthRanger fetch 502 Bad Gateway",
    );
  });

  it("propagates exceptions from validateTenantContext (rejects empty tenantId)", async () => {
    mockValidate.mockImplementationOnce(() => {
      throw new Error("Job payload missing tenantId");
    });
    await expect(
      processPatrolTrackMaterialize(makeJob({ tenantId: "" })),
    ).rejects.toThrow("Job payload missing tenantId");
    // materializePatrolTrack should not have been called when validation throws.
    expect(mockMaterialize).not.toHaveBeenCalled();
  });
});
