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

// vi.hoisted ensures mockPatrolFindUnique exists before the hoisted vi.mock
// factory below runs. Referencing the standalone fn (not
// platformPrisma.patrol.findUnique) also avoids the unbound-method lint an
// inline method reference would trip — same pattern as
// patrol-track-materialization.test.ts's mockErConnFindUnique.
const { mockPatrolFindUnique } = vi.hoisted(() => ({
  mockPatrolFindUnique: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    __marker: "platformPrisma-mock",
    patrol: { findUnique: mockPatrolFindUnique },
  },
}));

vi.mock("../../lib/patrol-track-materialization", () => ({
  materializePatrolTrack: vi.fn(),
  recomputeDistanceAndDuration: vi.fn(),
}));

vi.mock("../../queues/area-rederive.queue", () => ({
  enqueueAreaRederive: vi.fn().mockResolvedValue("area-job-1"),
}));

vi.mock("../../queues/municipality-assign.queue", () => ({
  enqueueMunicipalityAssign: vi.fn().mockResolvedValue("muni-job-1"),
}));

import { processPatrolTrackMaterialize } from "../patrol-track-materialize.processor";
import { validateTenantContext } from "../../workers/base-worker";
import {
  materializePatrolTrack,
  recomputeDistanceAndDuration,
} from "../../lib/patrol-track-materialization";
import { platformPrisma } from "@marine-guardian/db";
import { enqueueAreaRederive } from "../../queues/area-rederive.queue";
import { enqueueMunicipalityAssign } from "../../queues/municipality-assign.queue";

const mockMaterialize = materializePatrolTrack as ReturnType<typeof vi.fn>;
const mockRecompute = recomputeDistanceAndDuration as ReturnType<typeof vi.fn>;
const mockValidate = validateTenantContext as ReturnType<typeof vi.fn>;
const mockEnqueueAreaRederive = enqueueAreaRederive as ReturnType<typeof vi.fn>;
const mockEnqueueMunicipalityAssign = enqueueMunicipalityAssign as ReturnType<
  typeof vi.fn
>;

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
      trackChanged: false,
    });
    // Default: patrol already area-derived (neverDerived=false), so the
    // default trackChanged=false above means the geometry fan-out is NOT
    // enqueued unless a test explicitly opts in (trackChanged=true or
    // areaDerivedAt=null) — keeps the pre-existing tests below unaffected.
    mockPatrolFindUnique.mockResolvedValue({
      areaDerivedAt: new Date("2026-05-01T00:00:00Z"),
    });
    mockEnqueueAreaRederive.mockResolvedValue("area-job-1");
    mockEnqueueMunicipalityAssign.mockResolvedValue("muni-job-1");
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
      trackChanged: false,
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
      trackChanged: false,
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
      trackChanged: false,
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
      trackChanged: false,
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

  it("calls recomputeDistanceAndDuration when materialize result is not skipped", async () => {
    // beforeEach already sets mockMaterialize to return skipped:false
    await processPatrolTrackMaterialize(makeJob({ patrolId: "patrol-42" }));
    expect(mockRecompute).toHaveBeenCalledTimes(1);
    expect(mockRecompute).toHaveBeenCalledWith(platformPrisma, "patrol-42");
  });

  it("does NOT call recomputeDistanceAndDuration when materialize result is skipped", async () => {
    mockMaterialize.mockResolvedValueOnce({
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded: false,
      skipped: true,
      skipReason: "no_segment" as const,
      trackChanged: false,
    });
    await processPatrolTrackMaterialize(makeJob());
    expect(mockRecompute).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // Geometry fan-out gate (er-sync CPU-spiral fix follow-up) — this
  // processor is now the SINGLE trigger for patrol area-rederive +
  // municipality-assign, gated on trackChanged OR never-derived.
  // -------------------------------------------------------------------------

  it("enqueues area-rederive + municipality-assign when trackChanged=true", async () => {
    mockMaterialize.mockResolvedValueOnce({
      patrolTrackId: "pt-1",
      pointCount: 50,
      hasTimestamps: true,
      lastTrackTime: new Date("2026-05-20T13:00:00Z"),
      patrolEnded: false,
      skipped: false,
      trackChanged: true,
    });

    await processPatrolTrackMaterialize(
      makeJob({ tenantId: "tenant-9", patrolId: "patrol-9" }),
    );

    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith({
      tenantId: "tenant-9",
      userId: "system",
      entity: "patrol",
      id: "patrol-9",
    });
    expect(mockEnqueueMunicipalityAssign).toHaveBeenCalledWith({
      tenantId: "tenant-9",
      userId: "system",
      entity: "patrol",
      id: "patrol-9",
    });
  });

  it("enqueues area-rederive + municipality-assign when the patrol has never been area-derived (areaDerivedAt null), even if trackChanged=false", async () => {
    mockMaterialize.mockResolvedValueOnce({
      patrolTrackId: "pt-1",
      pointCount: 10,
      hasTimestamps: true,
      lastTrackTime: new Date("2026-05-20T08:00:00Z"),
      patrolEnded: false,
      skipped: false,
      trackChanged: false,
    });
    mockPatrolFindUnique.mockResolvedValueOnce({ areaDerivedAt: null });

    await processPatrolTrackMaterialize(
      makeJob({ tenantId: "tenant-9", patrolId: "patrol-9" }),
    );

    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "patrol-9" }),
    );
    expect(mockEnqueueMunicipalityAssign).toHaveBeenCalledWith(
      expect.objectContaining({ id: "patrol-9" }),
    );
  });

  it("does NOT enqueue area-rederive or municipality-assign when trackChanged=false AND the patrol was already area-derived", async () => {
    mockMaterialize.mockResolvedValueOnce({
      patrolTrackId: "pt-1",
      pointCount: 10,
      hasTimestamps: true,
      lastTrackTime: new Date("2026-05-20T08:00:00Z"),
      patrolEnded: false,
      skipped: false,
      trackChanged: false,
    });
    mockPatrolFindUnique.mockResolvedValueOnce({
      areaDerivedAt: new Date("2026-05-01T00:00:00Z"),
    });

    await processPatrolTrackMaterialize(
      makeJob({ tenantId: "tenant-9", patrolId: "patrol-9" }),
    );

    expect(mockEnqueueAreaRederive).not.toHaveBeenCalled();
    expect(mockEnqueueMunicipalityAssign).not.toHaveBeenCalled();
  });

  it("does NOT enqueue area-rederive or municipality-assign for a skipped materialize when the patrol was already area-derived", async () => {
    mockMaterialize.mockResolvedValueOnce({
      patrolTrackId: null,
      pointCount: 0,
      hasTimestamps: false,
      lastTrackTime: null,
      patrolEnded: false,
      skipped: true,
      skipReason: "no_credentials" as const,
      trackChanged: false,
    });
    mockPatrolFindUnique.mockResolvedValueOnce({
      areaDerivedAt: new Date("2026-05-01T00:00:00Z"),
    });

    await processPatrolTrackMaterialize(makeJob());

    expect(mockEnqueueAreaRederive).not.toHaveBeenCalled();
    expect(mockEnqueueMunicipalityAssign).not.toHaveBeenCalled();
  });

  it("swallows enqueueAreaRederive failures without throwing (logs + still enqueues municipality-assign)", async () => {
    mockMaterialize.mockResolvedValueOnce({
      patrolTrackId: "pt-1",
      pointCount: 50,
      hasTimestamps: true,
      lastTrackTime: new Date("2026-05-20T13:00:00Z"),
      patrolEnded: false,
      skipped: false,
      trackChanged: true,
    });
    mockEnqueueAreaRederive.mockRejectedValueOnce(new Error("queue down"));

    await expect(
      processPatrolTrackMaterialize(makeJob()),
    ).resolves.not.toThrow();
    expect(mockEnqueueMunicipalityAssign).toHaveBeenCalledTimes(1);
  });
});
