// municipality-assign processor tests.
//
// Focuses on the robustness contract added 2026-07-14: a job whose target
// event/patrol row no longer exists (deleted between enqueue and processing —
// e.g. a stale backlog drained after a staging refresh) must return a clean
// skipped result with skipReason="not_found" instead of throwing
// (findUniqueOrThrow) and churning through BullMQ retries.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { MunicipalityAssignJobPayload } from "../../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    municipality: { findMany: vi.fn() },
    protectedZone: { findMany: vi.fn() },
    event: { findUnique: vi.fn(), update: vi.fn() },
    patrol: { findUnique: vi.fn(), update: vi.fn() },
    eventCoveredZone: { upsert: vi.fn() },
    patrolCoveredZone: { upsert: vi.fn() },
  },
}));

// Assignment helpers are exhaustively tested in @marine-guardian/shared; here
// they are stubbed so the not-found path never reaches them.
vi.mock("@marine-guardian/shared/lib/municipality-assignment", () => ({
  assignMunicipalityByContainment: vi.fn().mockReturnValue(null),
  assignMunicipalityToDominantTrackByContainment: vi.fn().mockReturnValue(null),
  assignZonesToPoint: vi.fn().mockReturnValue([]),
  assignZonesToTrack: vi.fn().mockReturnValue([]),
  classifyPointTerrain: vi.fn().mockReturnValue("land"),
  classifyTrackTerrain: vi.fn().mockReturnValue("land"),
}));

import { processMunicipalityAssign } from "../municipality-assign.processor";
import { platformPrisma } from "@marine-guardian/db";

// Typed handle onto the mocked prisma surface used by this processor.
const pp = platformPrisma as unknown as {
  municipality: { findMany: ReturnType<typeof vi.fn> };
  protectedZone: { findMany: ReturnType<typeof vi.fn> };
  event: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  patrol: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

function makeJob(
  overrides: Partial<MunicipalityAssignJobPayload> = {},
): Job<MunicipalityAssignJobPayload> {
  return {
    id: "test-job-1",
    data: {
      tenantId: "tenant-1",
      userId: "user-1",
      entity: "event",
      id: "entity-1",
      ...overrides,
    },
  } as unknown as Job<MunicipalityAssignJobPayload>;
}

describe("processMunicipalityAssign — missing row robustness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pp.municipality.findMany.mockResolvedValue([]);
    pp.protectedZone.findMany.mockResolvedValue([]);
  });

  it("returns skipped not_found when the event row was deleted (findUnique → null)", async () => {
    pp.event.findUnique.mockResolvedValueOnce(null);
    const result = await processMunicipalityAssign(makeJob({ entity: "event", id: "gone-event" }));
    expect(result).toEqual({
      entity: "event",
      id: "gone-event",
      municipalityId: null,
      zoneIds: [],
      skipped: true,
      skipReason: "not_found",
    });
    expect(pp.event.update).not.toHaveBeenCalled();
  });

  it("returns skipped not_found when the patrol row was deleted (findUnique → null)", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce(null);
    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "gone-patrol" }));
    expect(result).toEqual({
      entity: "patrol",
      id: "gone-patrol",
      municipalityId: null,
      zoneIds: [],
      skipped: true,
      skipReason: "not_found",
    });
    expect(pp.patrol.update).not.toHaveBeenCalled();
  });

  it("still skips (no_location) for an existing event with null coordinates — pre-existing contract preserved", async () => {
    pp.event.findUnique.mockResolvedValueOnce({
      id: "no-loc-event",
      tenantId: "tenant-1",
      locationLat: null,
      locationLon: null,
    });
    const result = await processMunicipalityAssign(makeJob({ entity: "event", id: "no-loc-event" }));
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_location");
    expect(pp.event.update).not.toHaveBeenCalled();
  });
});
