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

// Attribution-provenance contract: municipalityAttributionMethod must record
// HOW municipalityId was resolved. This processor only ever does containment
// (boundaries-only governing rule — no nearest-guess), so a resolved
// municipality is "containment" regardless of WHICH start-point source was
// used, and an unattributed row records null rather than a false claim.
describe("processMunicipalityAssign — municipalityAttributionMethod provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pp.municipality.findMany.mockResolvedValue([]);
    pp.protectedZone.findMany.mockResolvedValue([]);
  });

  function patrolUpdateData() {
    return ((pp.patrol.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
  }

  it("records containment when the RECORDED start location resolves a municipality", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-prov-1",
      tenantId: "tenant-1",
      startLocationLat: 13.4,
      startLocationLon: 121.2,
      municipalityId: null,
      municipalityManual: false,
      track: null,
    });
    mockedAssignByContainment.mockReturnValue("muni-A");

    await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-prov-1" }));

    expect(patrolUpdateData()).toHaveProperty("municipalityAttributionMethod", "containment");
  });

  it("records containment when the TRACK-FIRST-POINT fallback resolves a municipality (same rule, different source)", async () => {
    const firstPoint = { lat: 13.9, lon: 121.9 };
    const trackGeojson = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[121.9, 13.9]] } },
      ],
    };

    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-prov-2",
      tenantId: "tenant-1",
      startLocationLat: null,
      startLocationLon: null,
      municipalityId: null,
      municipalityManual: false,
      track: { trackGeojson },
    });
    mockedFirstTrackPoint.mockReturnValue(firstPoint);
    mockedAssignByContainment.mockReturnValue("muni-A");

    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-prov-2" }));

    expect(mockedFirstTrackPoint).toHaveBeenCalledWith(trackGeojson);
    expect(result.municipalityId).toBe("muni-A");
    expect(patrolUpdateData()).toHaveProperty("municipalityAttributionMethod", "containment");
  });

  it("records null (not a false 'containment') when the start point falls outside every boundary", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-prov-3",
      tenantId: "tenant-1",
      startLocationLat: 5.0,
      startLocationLon: 100.0,
      municipalityId: null,
      municipalityManual: false,
      track: null,
    });
    mockedAssignByContainment.mockReturnValue(null);

    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-prov-3" }));

    expect(result.municipalityId).toBeNull();
    expect(patrolUpdateData()).toHaveProperty("municipalityAttributionMethod", null);
  });

  it("leaves municipalityAttributionMethod untouched for a manual override (anti-clobber covers provenance too)", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-prov-4",
      tenantId: "tenant-1",
      startLocationLat: 13.4,
      startLocationLon: 121.2,
      municipalityId: "muni-manual-existing",
      municipalityManual: true,
      track: null,
    });
    mockedAssignByContainment.mockReturnValue("muni-auto-computed");

    await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-prov-4" }));

    expect(patrolUpdateData()).not.toHaveProperty("municipalityAttributionMethod");
    expect(patrolUpdateData()).not.toHaveProperty("municipalityId");
  });

  it("skips a patrol with neither a start location nor a track — no point is invented", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-prov-5",
      tenantId: "tenant-1",
      startLocationLat: null,
      startLocationLon: null,
      municipalityId: null,
      municipalityManual: false,
      track: null,
    });

    const result = await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-prov-5" }));

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_start_location");
    expect(pp.patrol.update).not.toHaveBeenCalled();
    expect(mockedAssignByContainment).not.toHaveBeenCalled();
  });

  it("records containment on the EVENT path when a municipality is resolved", async () => {
    pp.event.findUnique.mockResolvedValueOnce({
      id: "event-prov-1",
      tenantId: "tenant-1",
      locationLat: 13.4,
      locationLon: 121.2,
    });
    mockedAssignByContainment.mockReturnValue("muni-A");

    await processMunicipalityAssign(makeJob({ entity: "event", id: "event-prov-1" }));

    const data = ((pp.event.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expect(data).toHaveProperty("municipalityAttributionMethod", "containment");
  });
});

// EVENT manual-override anti-clobber (2026-07-21).
//
// The event path historically had NO guard at all: it overwrote municipalityId
// unconditionally on every sync, so a command-center officer's correction was
// silently destroyed the next time the row was re-processed. That made the
// override control worse than useless — it looked like it worked.
//
// Unlike Patrol, Event carries no `municipalityManual` boolean; the provenance
// enum IS the lock (municipalityAttributionMethod === "manual"). These tests
// pin that contract. Sibling of the patrol block above; the two paths must stay
// behaviourally identical.
describe("processMunicipalityAssign — event manual-override anti-clobber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pp.municipality.findMany.mockResolvedValue([]);
    pp.protectedZone.findMany.mockResolvedValue([]);
  });

  it("does not overwrite municipalityId/method when the event was manually overridden, but still writes terrain", async () => {
    pp.event.findUnique.mockResolvedValueOnce({
      id: "event-manual-1",
      tenantId: "tenant-1",
      locationLat: 13.4,
      locationLon: 121.2,
      municipalityId: "muni-officer-chose",
      municipalityAttributionMethod: "manual",
    });

    // The sync supplies a DIFFERENT municipality — this is exactly the clobber
    // the officer is being protected from.
    mockedAssignByContainment.mockReturnValue("muni-auto-computed");

    const result = await processMunicipalityAssign(
      makeJob({ entity: "event", id: "event-manual-1" }),
    );

    expect(pp.event.update).toHaveBeenCalledTimes(1);
    const data = ((pp.event.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("municipalityId");
    expect(data).not.toHaveProperty("municipalityAssignedAt");
    // Provenance must survive too — otherwise the next pass would see a
    // non-"manual" method and happily clobber the row.
    expect(data).not.toHaveProperty("municipalityAttributionMethod");
    // Geometry-derived fields still refresh.
    expect(data).toHaveProperty("terrain");

    expect(result.municipalityId).toBe("muni-officer-chose");
    expect(result.skipped).toBe(false);
    expect(result.skipReason).toBe("manual_override");
  });

  it("writes municipalityId as normal when the method is 'containment' (auto row, not overridden)", async () => {
    pp.event.findUnique.mockResolvedValueOnce({
      id: "event-auto-1",
      tenantId: "tenant-1",
      locationLat: 13.4,
      locationLon: 121.2,
      municipalityId: "muni-old",
      municipalityAttributionMethod: "containment",
    });

    mockedAssignByContainment.mockReturnValue("muni-auto-computed");

    const result = await processMunicipalityAssign(
      makeJob({ entity: "event", id: "event-auto-1" }),
    );

    const data = ((pp.event.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expect(data).toHaveProperty("municipalityId", "muni-auto-computed");
    expect(data).toHaveProperty("municipalityAssignedAt");
    expect(result.municipalityId).toBe("muni-auto-computed");
    expect(result.skipReason).toBeUndefined();
  });

  // Regression guard for the SQL three-valued-logic trap
  // (LESSONS_GLOBAL `sql.three-valued-logic.not-predicate-skips-nulls`): the
  // overwhelming majority of rows carry a NULL method. If the guard were ever
  // re-expressed as a DB `not: "manual"` predicate, `NULL <> 'manual'` would
  // evaluate to NULL and these rows would stop being processed entirely.
  it("writes municipalityId as normal when the method is NULL (never-attributed row)", async () => {
    pp.event.findUnique.mockResolvedValueOnce({
      id: "event-null-method-1",
      tenantId: "tenant-1",
      locationLat: 13.4,
      locationLon: 121.2,
      municipalityId: null,
      municipalityAttributionMethod: null,
    });

    mockedAssignByContainment.mockReturnValue("muni-auto-computed");

    const result = await processMunicipalityAssign(
      makeJob({ entity: "event", id: "event-null-method-1" }),
    );

    const data = ((pp.event.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expect(data).toHaveProperty("municipalityId", "muni-auto-computed");
    expect(result.skipReason).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALUE ⇔ PROVENANCE PAIRING INVARIANT (2026-07-21)
//
// The tests above assert the CORRECT method per scenario. This block asserts
// something weaker but structurally stronger: whatever the processor decides,
// `municipalityId` and `municipalityAttributionMethod` must always travel in
// the SAME write. Never one without the other.
//
// WHY a separate, shape-level block: dev accumulated 34 events and 1 patrol
// whose `municipality_id` was set while `municipality_attribution_method` was
// NULL. There was no second writer and no disagreement about the VALUE —
// containment reproduced the stored municipality exactly for all 35 rows. The
// rows were written by a worker image built minutes BEFORE 825cf6c, whose
// update payload was `{ municipalityId, municipalityAssignedAt, terrain }`
// with no method key at all. Every per-scenario test above passes against that
// build for the cases it does not cover; only a payload-SHAPE assertion fails.
//
// A row with a municipality but a NULL method is invisible to every
// method-keyed filter (the officer needs-review queue in 4f41c57) and
// misrepresents how it was attributed — so the pairing is the contract, and it
// is pinned here independently of which value is right.
//
// The DB-level counterpart is the `*_municipality_attribution_paired` CHECK
// constraint (migration 20260721020000), which enforces the same invariant
// against ANY writer — including a stale worker that this test suite never
// runs against.
describe("processMunicipalityAssign — municipalityId ⇔ method pairing invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pp.municipality.findMany.mockResolvedValue([]);
    pp.protectedZone.findMany.mockResolvedValue([]);
  });

  /**
   * Asserts the pairing on a captured update payload.
   *
   * Three shapes are legal:
   *   - neither key present  → anti-clobber branch (manual override, terrain only)
   *   - both keys present    → auto branch, value and provenance written together
   * Anything else is drift: a value without provenance, or a provenance claim
   * without a value.
   */
  function expectPaired(data: Record<string, unknown>) {
    const hasId = Object.prototype.hasOwnProperty.call(data, "municipalityId");
    const hasMethod = Object.prototype.hasOwnProperty.call(
      data,
      "municipalityAttributionMethod",
    );
    // Both keys, or neither. `toEqual` on the pair (rather than two separate
    // assertions) makes the failure message show WHICH side went missing.
    expect({ writesMunicipalityId: hasId, writesAttributionMethod: hasMethod }).toEqual({
      writesMunicipalityId: hasId,
      writesAttributionMethod: hasId,
    });
  }

  it("EVENT auto path writes municipalityId and method together when a municipality resolves", async () => {
    pp.event.findUnique.mockResolvedValueOnce({
      id: "event-pair-1",
      tenantId: "tenant-1",
      locationLat: 13.4,
      locationLon: 121.2,
      municipalityId: null,
      municipalityAttributionMethod: null,
    });
    mockedAssignByContainment.mockReturnValue("muni-A");

    await processMunicipalityAssign(makeJob({ entity: "event", id: "event-pair-1" }));

    const data = ((pp.event.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expectPaired(data);
    expect(data.municipalityId).toBe("muni-A");
    expect(data.municipalityAttributionMethod).toBe("containment");
  });

  it("EVENT auto path writes municipalityId and method together when NOTHING resolves (both null)", async () => {
    pp.event.findUnique.mockResolvedValueOnce({
      id: "event-pair-2",
      tenantId: "tenant-1",
      locationLat: 5.0,
      locationLon: 100.0,
      municipalityId: null,
      municipalityAttributionMethod: null,
    });
    mockedAssignByContainment.mockReturnValue(null);

    await processMunicipalityAssign(makeJob({ entity: "event", id: "event-pair-2" }));

    const data = ((pp.event.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expectPaired(data);
    expect(data.municipalityId).toBeNull();
    expect(data.municipalityAttributionMethod).toBeNull();
  });

  it("PATROL auto path writes municipalityId and method together when a municipality resolves", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-pair-1",
      tenantId: "tenant-1",
      startLocationLat: 13.4,
      startLocationLon: 121.2,
      municipalityId: null,
      municipalityManual: false,
      track: null,
    });
    mockedAssignByContainment.mockReturnValue("muni-A");

    await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-pair-1" }));

    const data = ((pp.patrol.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expectPaired(data);
    expect(data.municipalityId).toBe("muni-A");
    expect(data.municipalityAttributionMethod).toBe("containment");
  });

  it("PATROL auto path writes municipalityId and method together when NOTHING resolves (both null)", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-pair-2",
      tenantId: "tenant-1",
      startLocationLat: 5.0,
      startLocationLon: 100.0,
      municipalityId: null,
      municipalityManual: false,
      track: null,
    });
    mockedAssignByContainment.mockReturnValue(null);

    await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-pair-2" }));

    const data = ((pp.patrol.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expectPaired(data);
    expect(data.municipalityId).toBeNull();
    expect(data.municipalityAttributionMethod).toBeNull();
  });

  it("anti-clobber branches write NEITHER key (pairing holds by absence, both entities)", async () => {
    pp.patrol.findUnique.mockResolvedValueOnce({
      id: "patrol-pair-3",
      tenantId: "tenant-1",
      startLocationLat: 13.4,
      startLocationLon: 121.2,
      municipalityId: "muni-manual",
      municipalityManual: true,
      track: null,
    });
    mockedAssignByContainment.mockReturnValue("muni-auto");

    await processMunicipalityAssign(makeJob({ entity: "patrol", id: "patrol-pair-3" }));

    const patrolData = ((pp.patrol.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expectPaired(patrolData);
    expect(patrolData).not.toHaveProperty("municipalityId");

    vi.clearAllMocks();
    pp.municipality.findMany.mockResolvedValue([]);
    pp.protectedZone.findMany.mockResolvedValue([]);

    pp.event.findUnique.mockResolvedValueOnce({
      id: "event-pair-3",
      tenantId: "tenant-1",
      locationLat: 13.4,
      locationLon: 121.2,
      municipalityId: "muni-manual",
      municipalityAttributionMethod: "manual",
    });
    mockedAssignByContainment.mockReturnValue("muni-auto");

    await processMunicipalityAssign(makeJob({ entity: "event", id: "event-pair-3" }));

    const eventData = ((pp.event.update.mock.calls[0]?.[0] ?? {}) as { data: Record<string, unknown> }).data;
    expectPaired(eventData);
    expect(eventData).not.toHaveProperty("municipalityId");
  });
});
