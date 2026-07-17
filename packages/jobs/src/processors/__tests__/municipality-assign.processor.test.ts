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
  assignZonesToPoint: vi.fn().mockReturnValue([]),
  assignZonesToTrack: vi.fn().mockReturnValue([]),
  classifyPointTerrain: vi.fn().mockReturnValue("land"),
  classifyTrackTerrain: vi.fn().mockReturnValue("land"),
  firstTrackPoint: vi.fn().mockReturnValue(null),
}));

import { processMunicipalityAssign } from "../municipality-assign.processor";
import { platformPrisma } from "@marine-guardian/db";
import {
  assignMunicipalityByContainment,
  firstTrackPoint,
} from "@marine-guardian/shared/lib/municipality-assignment";

// Typed handle onto the mocked prisma surface used by this processor.
const pp = platformPrisma as unknown as {
  municipality: { findMany: ReturnType<typeof vi.fn> };
  protectedZone: { findMany: ReturnType<typeof vi.fn> };
  event: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  patrol: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

const mockedAssignByContainment = assignMunicipalityByContainment as unknown as ReturnType<typeof vi.fn>;
const mockedFirstTrackPoint = firstTrackPoint as unknown as ReturnType<typeof vi.fn>;

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

// Layer-1 patrol attribution governing rule (owner 2026-07-15): a patrol is
// counted ONLY in the municipality that CONTAINS its START point — never the
// dominant-track share, never nearest. These tests prove the processor calls
// assignMunicipalityByContainment with the START point (recorded
// startLocation, or the track's first point as fallback) rather than any
// track-majority computation.
describe("processMunicipalityAssign — patrol Layer-1 START-point attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pp.municipality.findMany.mockResolvedValue([]);
    pp.protectedZone.findMany.mockResolvedValue([]);
  });

  it("uses the recorded start point's municipality (A) even when the track's majority lies in a different municipality (B)", async () => {
    const startPoint = { lat: 13.4, lon: 121.2 }; // inside municipality A
    const trackGeojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[121.5, 13.7], [121.51, 13.71], [121.52, 13.72]] }, // mostly in B
        },
      ],
    };

    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-1",
      tenantId: "tenant-1",
      startLocationLat: startPoint.lat,
      startLocationLon: startPoint.lon,
      track: { trackGeojson },
    });

    // assignMunicipalityByContainment is only ever called with the START
    // point in this scenario — return "muni-A" for it, "muni-B" for anything
    // else, so the assertion fails loudly if the processor ever passes a
    // track/dominant point instead.
    mockedAssignByContainment.mockImplementation((point: { lat: number; lon: number }) =>
      point.lat === startPoint.lat && point.lon === startPoint.lon ? "muni-A" : "muni-B",
    );

    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-1" }));

    expect(result.municipalityId).toBe("muni-A");
    expect(mockedFirstTrackPoint).not.toHaveBeenCalled();
    expect(pp.patrol.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ municipalityId: "muni-A" }) as object }),
    );
  });

  it("falls back to the track's first point when startLocationLat/Lon is null, and attributes by ITS containing municipality", async () => {
    const firstPoint = { lat: 13.9, lon: 121.9 }; // inside municipality A
    const trackGeojson = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[121.9, 13.9]] } },
      ],
    };

    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-2",
      tenantId: "tenant-1",
      startLocationLat: null,
      startLocationLon: null,
      track: { trackGeojson },
    });

    mockedFirstTrackPoint.mockReturnValue(firstPoint);
    mockedAssignByContainment.mockImplementation((point: { lat: number; lon: number }) =>
      point.lat === firstPoint.lat && point.lon === firstPoint.lon ? "muni-A" : "muni-B",
    );

    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-2" }));

    expect(result.municipalityId).toBe("muni-A");
    expect(mockedFirstTrackPoint).toHaveBeenCalledWith(trackGeojson);
    expect(pp.patrol.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ municipalityId: "muni-A" }) as object }),
    );
  });
});

// Task 3 — manual per-patrol municipality override anti-clobber contract
// (owner 2026-07-15): once an officer sets municipalityId by hand
// (municipalityManual=true), auto attribution must NEVER overwrite it —
// terrain + covered-zones still refresh (geometry-derived), but the Layer-1
// municipalityId/municipalityAssignedAt write is skipped.
describe("processMunicipalityAssign — patrol manual-override anti-clobber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pp.municipality.findMany.mockResolvedValue([]);
    pp.protectedZone.findMany.mockResolvedValue([]);
  });

  it("does not overwrite municipalityId/municipalityAssignedAt when municipalityManual=true, but still writes terrain", async () => {
    const startPoint = { lat: 13.4, lon: 121.2 };

    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-manual-1",
      tenantId: "tenant-1",
      startLocationLat: startPoint.lat,
      startLocationLon: startPoint.lon,
      municipalityId: "muni-manual-existing",
      municipalityManual: true,
      track: null,
    });

    mockedAssignByContainment.mockReturnValue("muni-auto-computed");

    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-manual-1" }));

    expect(pp.patrol.update).toHaveBeenCalledTimes(1);
    const callArgs = (pp.patrol.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> };
    expect(callArgs.data).not.toHaveProperty("municipalityId");
    expect(callArgs.data).not.toHaveProperty("municipalityAssignedAt");
    expect(callArgs.data).toHaveProperty("terrain");

    expect(result.municipalityId).toBe("muni-manual-existing");
    expect(result.skipped).toBe(false);
    expect(result.skipReason).toBe("manual_override");
  });

  it("writes municipalityId/municipalityAssignedAt as normal when municipalityManual=false", async () => {
    const startPoint = { lat: 13.4, lon: 121.2 };

    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-auto-1",
      tenantId: "tenant-1",
      startLocationLat: startPoint.lat,
      startLocationLon: startPoint.lon,
      municipalityId: null,
      municipalityManual: false,
      track: null,
    });

    mockedAssignByContainment.mockReturnValue("muni-auto-computed");

    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-auto-1" }));

    const callArgs = (pp.patrol.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> };
    expect(callArgs.data).toHaveProperty("municipalityId", "muni-auto-computed");
    expect(callArgs.data).toHaveProperty("municipalityAssignedAt");
    expect(result.municipalityId).toBe("muni-auto-computed");
    expect(result.skipReason).toBeUndefined();
  });
});
