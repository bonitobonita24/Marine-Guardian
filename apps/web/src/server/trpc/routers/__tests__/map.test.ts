/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
    },
    eventType: {
      findMany: vi.fn(),
    },
    subject: {
      findMany: vi.fn(),
    },
    observation: {
      findMany: vi.fn(),
    },
    patrol: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    patrolTrack: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    patrolArea: {
      findMany: vi.fn(),
    },
    municipality: {
      findMany: vi.fn(),
    },
    protectedZone: {
      findMany: vi.fn(),
    },
  },
}));

// Build a stored PatrolTrack.trackGeojson FeatureCollection (LineString of
// [lon, lat] coords) — the authoritative track geometry the map now reads.
function lineStringGeojson(coords: [number, number][]) {
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: coords } },
    ],
  };
}

vi.mock("../../../lib/rate-limit", () => ({
  rateLimiters: {
    public: { check: vi.fn() },
    api: { check: vi.fn() },
    auth: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { mapRouter, normalizeL3, l3ValuesFromJsons } from "../map";

const createCaller = createCallerFactory(mapRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles: ["operator" as const],
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("map.events.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns events with non-null coordinates for the authenticated tenant", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        id: "ev-1",
        title: "Blast fishing",
        priority: 200,
        locationLat: 1.5,
        locationLon: 124.0,
        reportedAt: new Date("2026-05-10"),
        eventType: { display: "Blast Fishing", category: "law_enforcement" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.events.list({});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "ev-1",
      locationLat: 1.5,
      locationLon: 124.0,
    });
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      locationLat: { not: null },
      locationLon: { not: null },
      // Skylight events are excluded from the Live Map (display-based filter).
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    });
  });

  // SKY-1: default-OFF opt-in toggle. Skylight stays excluded from every
  // OTHER surface (reports, dashboard, /events list, municipality coverage) —
  // only the /map events query understands `includeSkylight`.
  it("still excludes Skylight when includeSkylight is explicitly false", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ includeSkylight: false });

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    });
  });

  it("includes Skylight events when includeSkylight is true", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ includeSkylight: true });

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).not.toHaveProperty("NOT");
  });

  it("scopes the query to the tenant — never leaks cross-tenant", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.events.list({});

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ tenantId: "other-tenant" });
  });

  it("filters by since timestamp when provided", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const since = new Date("2026-05-01");
    const caller = createCaller(makeCtx());
    await caller.events.list({ since });

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      reportedAt: { gte: since },
    });
  });

  it("filters by municipalityId when provided", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ municipalityId: "muni-1" });

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      municipalityId: "muni-1",
    });
  });

  it("omits the municipalityId filter when not provided", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({});

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).not.toHaveProperty("municipalityId");
  });

  it("selects event_details_json so the L3 value can be derived", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);
    const caller = createCaller(makeCtx());
    await caller.events.list({});
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.select).toMatchObject({ eventDetailsJson: true });
  });

  it("derives a normalized eventTypeValue from the curated L3 key and STRIPS the raw blob", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        id: "ev-1",
        title: "Unreg vessel",
        priority: 200,
        locationLat: 1.5,
        locationLon: 124.0,
        reportedAt: new Date("2026-05-10"),
        eventType: {
          id: "t-unreg",
          display: "Unregistered Illegal Fishing",
          category: "law-enforcement-and-apprehensions",
        },
        // Dirty value (trailing/duplicate whitespace) — normalizeL3 cleans it.
        eventDetailsJson: {
          unregisteredillegalfishing_unregistered_fishinggear:
            "  Unregistered fishing  vessel ",
          notes: "secret blob that must not ship",
        },
        assets: [],
      },
      {
        id: "ev-2",
        title: "No type",
        priority: 100,
        locationLat: 1.6,
        locationLon: 124.1,
        reportedAt: new Date("2026-05-11"),
        eventType: {
          id: "t-unreg",
          display: "Unregistered Illegal Fishing",
          category: "law-enforcement-and-apprehensions",
        },
        eventDetailsJson: {}, // no Type value → (Unspecified) bucket
        assets: [],
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.events.list({});

    expect(result[0]).toMatchObject({
      id: "ev-1",
      eventTypeValue: "Unregistered fishing vessel",
    });
    expect(result[1]).toMatchObject({ id: "ev-2", eventTypeValue: "(Unspecified)" });
    // The raw event_details_json is never shipped to the client.
    expect(result[0]).not.toHaveProperty("eventDetailsJson");
    expect(result[1]).not.toHaveProperty("eventDetailsJson");
  });
});

describe("map.events.list province rollup filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves province to its municipality ids and applies an `in` filter when no municipalityId is given", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1" },
      { id: "muni-2" },
    ] as any);
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ province: "Oriental Mindoro" });

    expect(prisma.municipality.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, province: "Oriental Mindoro" },
      select: { id: true },
    });
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      municipalityId: { in: ["muni-1", "muni-2"] },
    });
  });

  it("municipalityId wins over province when both are provided", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1" },
    ] as any);
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ municipalityId: "muni-9", province: "Oriental Mindoro" });

    expect(prisma.municipality.findMany).not.toHaveBeenCalled();
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ municipalityId: "muni-9" });
  });

  it("omits municipalityId when neither municipalityId nor province is given", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({});

    expect(prisma.municipality.findMany).not.toHaveBeenCalled();
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).not.toHaveProperty("municipalityId");
  });
});

describe("map.events.list includeChildren (Phase 4B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("folds child protected zones into an OR clause when includeChildren is true and a municipality scope resolves", async () => {
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([
      { id: "zone-1" },
      { id: "zone-2" },
    ] as any);
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ municipalityId: "muni-1", includeChildren: true });

    expect(prisma.protectedZone.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, parentMunicipalityId: { in: ["muni-1"] } },
      select: { id: true },
    });
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      OR: [
        { municipalityId: "muni-1" },
        { coveredZones: { some: { protectedZoneId: { in: ["zone-1", "zone-2"] } } } },
      ],
    });
    expect(findManyCall?.where).not.toHaveProperty("municipalityId");
  });

  it("falls back to the plain municipalityId clause when includeChildren resolves no child zones", async () => {
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([]);
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ municipalityId: "muni-1", includeChildren: true });

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ municipalityId: "muni-1" });
    expect(findManyCall?.where).not.toHaveProperty("OR");
  });

  it("never resolves child zones when includeChildren is falsy", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ municipalityId: "muni-1" });

    expect(prisma.protectedZone.findMany).not.toHaveBeenCalled();
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ municipalityId: "muni-1" });
  });

  it("never resolves child zones when no municipality scope is active, even if includeChildren is true", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.events.list({ includeChildren: true });

    expect(prisma.protectedZone.findMany).not.toHaveBeenCalled();
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).not.toHaveProperty("municipalityId");
    expect(findManyCall?.where).not.toHaveProperty("OR");
  });
});

describe("normalizeL3", () => {
  it("trims and collapses internal whitespace, preserving case", () => {
    expect(normalizeL3("  Spear   Fishing ")).toBe("Spear Fishing");
    expect(normalizeL3("Active Gears")).toBe("Active Gears");
  });
  it("buckets empty / whitespace-only / non-string into (Unspecified)", () => {
    expect(normalizeL3("")).toBe("(Unspecified)");
    expect(normalizeL3("   ")).toBe("(Unspecified)");
    expect(normalizeL3(null)).toBe("(Unspecified)");
    expect(normalizeL3(undefined)).toBe("(Unspecified)");
    expect(normalizeL3(42)).toBe("(Unspecified)");
  });
});

describe("l3ValuesFromJsons", () => {
  it("counts distinct normalized values from the resolved key, sorted by count desc", () => {
    const jsons = [
      { k: "Spear Fishing" },
      { k: " Spear  Fishing " }, // merges with the above after normalize
      { k: "Active Gears" },
      {}, // → (Unspecified)
    ];
    expect(l3ValuesFromJsons(jsons, "k")).toEqual([
      { value: "Spear Fishing", count: 2 },
      { value: "(Unspecified)", count: 1 },
      { value: "Active Gears", count: 1 },
    ]);
  });
  it("buckets every event into (Unspecified) when the type has no L3 key (null)", () => {
    const jsons = [{ a: "x" }, { a: "y" }, {}];
    expect(l3ValuesFromJsons(jsons, null)).toEqual([
      { value: "(Unspecified)", count: 3 },
    ]);
  });
});

describe("map.subjects.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active subjects with last positions and computes staleness", async () => {
    const recentTime = new Date(Date.now() - 30 * 60 * 1000);
    const oldTime = new Date(Date.now() - 3 * 60 * 60 * 1000);

    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      {
        id: "sub-1",
        name: "Patrol Boat 1",
        subjectType: "patrol_boat",
        lastPositionLat: 1.5,
        lastPositionLon: 124.0,
        lastPositionAt: recentTime,
      },
      {
        id: "sub-2",
        name: "Ranger A",
        subjectType: "ranger",
        lastPositionLat: 1.6,
        lastPositionLon: 124.1,
        lastPositionAt: oldTime,
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.subjects.list();

    expect(result).toHaveLength(2);
    expect(result[0]?.isStale).toBe(false);
    expect(result[1]?.isStale).toBe(true);
    const findManyCall = vi.mocked(prisma.subject.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      isActive: true,
    });
  });

  it("scopes to tenant", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.subjects.list();

    const findManyCall = vi.mocked(prisma.subject.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ tenantId: "other-tenant" });
  });
});

describe("map.patrolTracks.byPatrolId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stored track polyline (trackGeojson) for the patrol", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "patrol-1",
      tenantId: TENANT_ID,
      startTime: new Date("2026-05-10T08:00:00Z"),
      endTime: new Date("2026-05-10T12:00:00Z"),
      segments: [{ leaderErId: "er-leader-1" }],
    } as any);

    vi.mocked(prisma.patrolTrack.findUnique).mockResolvedValue({
      trackGeojson: lineStringGeojson([
        [124.0, 1.5],
        [124.01, 1.51],
        [124.02, 1.52],
      ]),
    } as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.byPatrolId({ patrolId: "patrol-1" });

    expect(result.points).toHaveLength(3);
    // GeoJSON is [lon, lat]; the API returns {lat, lon}.
    expect(result.points[0]).toMatchObject({ lat: 1.5, lon: 124.0 });
    // Stored track is preferred — no observation reconstruction needed.
    expect(vi.mocked(prisma.observation.findMany)).not.toHaveBeenCalled();
  });

  it("falls back to observation reconstruction when no stored track exists", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "patrol-live",
      tenantId: TENANT_ID,
      startTime: new Date("2026-05-10T08:00:00Z"),
      endTime: new Date("2026-05-10T12:00:00Z"),
      segments: [{ leaderErId: "er-leader-1" }],
    } as any);
    vi.mocked(prisma.patrolTrack.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: "sub-leader-1" },
    ] as any);
    vi.mocked(prisma.observation.findMany).mockResolvedValue([
      { locationLat: 1.5, locationLon: 124.0, recordedAt: new Date("2026-05-10T09:00:00Z") },
      { locationLat: 1.51, locationLon: 124.01, recordedAt: new Date("2026-05-10T10:00:00Z") },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.byPatrolId({ patrolId: "patrol-live" });

    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({ lat: 1.5, lon: 124.0 });
  });

  it("rejects access to a patrol that belongs to a different tenant", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "patrol-x",
      tenantId: "other-tenant",
      startTime: new Date(),
      endTime: new Date(),
      segments: [],
    } as any);

    const caller = createCaller(makeCtx());
    await expect(
      caller.patrolTracks.byPatrolId({ patrolId: "patrol-x" })
    ).rejects.toThrow();
  });

  it("returns empty points if no stored track and patrol has no leadered segments", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "patrol-2",
      tenantId: TENANT_ID,
      startTime: new Date(),
      endTime: new Date(),
      segments: [],
    } as any);
    vi.mocked(prisma.patrolTrack.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.byPatrolId({ patrolId: "patrol-2" });

    expect(result.points).toEqual([]);
  });
});

describe("map.patrolTracks.active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one styled track per recent patrol-with-track, tagged by patrolType, scoped to tenant", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: lineStringGeojson([
          [124.0, 1.5],
          [124.01, 1.51],
        ]),
        patrol: { id: "patrol-sea", title: "Bay sweep", patrolType: "seaborne" },
      },
      {
        trackGeojson: lineStringGeojson([
          [125.0, 2.5],
          [125.01, 2.51],
          [125.02, 2.52],
        ]),
        patrol: { id: "patrol-foot", title: "Shore walk", patrolType: "foot" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.active();

    expect(result.tracks).toHaveLength(2);
    const byId = Object.fromEntries(result.tracks.map((t) => [t.patrolId, t]));
    expect(byId["patrol-sea"]?.patrolType).toBe("seaborne");
    expect(byId["patrol-foot"]?.patrolType).toBe("foot");
    expect(byId["patrol-sea"]?.points).toHaveLength(2);
    expect(byId["patrol-sea"]?.points[0]).toMatchObject({ lat: 1.5, lon: 124.0 });

    // Recent patrols regardless of state (not open-only); non-deleted, non-test,
    // this tenant; ordered by track recency; bounded payload.
    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      tenantId: TENANT_ID,
      patrol: { isDeleted: false, isTestPatrol: false },
    });
    expect(call?.where).not.toHaveProperty("state");
    expect(call?.take).toBe(50);
    expect(call?.orderBy).toMatchObject({ until: "desc" });
  });

  it("scopes to tenant — never leaks cross-tenant tracks", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    const result = await caller.patrolTracks.active();

    expect(result.tracks).toEqual([]);
    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ tenantId: "other-tenant" });
  });

  it("omits tracks with fewer than 2 points (not renderable as a polyline)", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: lineStringGeojson([[124.0, 1.5]]),
        patrol: { id: "patrol-thin", title: "Single ping", patrolType: "foot" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.active();

    expect(result.tracks).toEqual([]);
  });
});

describe("map.patrolTracks.inRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters tracks by patrol startTime range and municipalityId, tagged by patrolType", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: lineStringGeojson([
          [124.0, 1.5],
          [124.01, 1.51],
        ]),
        patrol: { id: "patrol-sea", title: "Bay sweep", patrolType: "seaborne" },
      },
    ] as any);

    const from = new Date("2026-06-01");
    const to = new Date("2026-06-27");
    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.inRange({
      from,
      to,
      municipalityId: "muni-1",
    });

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).toMatchObject({
      patrolId: "patrol-sea",
      patrolType: "seaborne",
    });

    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      tenantId: TENANT_ID,
      patrol: {
        isDeleted: false,
        isTestPatrol: false,
        startTime: { gte: from, lte: to },
        municipalityId: "muni-1",
      },
    });
    expect(call?.take).toBe(50);
    expect(call?.orderBy).toMatchObject({ until: "desc" });
  });

  it("omits startTime and municipalityId from the patrol filter when not provided", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.patrolTracks.inRange({});

    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      tenantId: TENANT_ID,
      patrol: { isDeleted: false, isTestPatrol: false },
    });
    expect(call?.where?.patrol).not.toHaveProperty("startTime");
    expect(call?.where?.patrol).not.toHaveProperty("municipalityId");
  });

  it("scopes to tenant and drops sub-2-point polylines", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: lineStringGeojson([[124.0, 1.5]]),
        patrol: { id: "patrol-thin", title: "Single ping", patrolType: "foot" },
      },
    ] as any);

    const caller = createCaller(makeCtx("other-tenant"));
    const result = await caller.patrolTracks.inRange({});

    expect(result.tracks).toEqual([]);
    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ tenantId: "other-tenant" });
  });
});

describe("map.patrolTracks.inRange province rollup filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves province to its municipality ids and applies an `in` filter when no municipalityId is given", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1" },
      { id: "muni-2" },
    ] as any);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.patrolTracks.inRange({ province: "Palawan" });

    expect(prisma.municipality.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, province: "Palawan" },
      select: { id: true },
    });
    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where?.patrol).toMatchObject({
      municipalityId: { in: ["muni-1", "muni-2"] },
    });
  });

  it("municipalityId wins over province when both are provided", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1" },
    ] as any);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.patrolTracks.inRange({
      municipalityId: "muni-9",
      province: "Palawan",
    });

    expect(prisma.municipality.findMany).not.toHaveBeenCalled();
    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where?.patrol).toMatchObject({ municipalityId: "muni-9" });
  });
});

describe("map.patrolTracks.inRange includeChildren (Phase 4B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("folds child protected zones into an OR clause when includeChildren is true and a municipality scope resolves", async () => {
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([
      { id: "zone-1" },
    ] as any);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.patrolTracks.inRange({
      municipalityId: "muni-1",
      includeChildren: true,
    });

    expect(prisma.protectedZone.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, parentMunicipalityId: { in: ["muni-1"] } },
      select: { id: true },
    });
    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where?.patrol).toMatchObject({
      OR: [
        { municipalityId: "muni-1" },
        { coveredZones: { some: { protectedZoneId: { in: ["zone-1"] } } } },
      ],
    });
    expect(call?.where?.patrol).not.toHaveProperty("municipalityId");
  });

  it("falls back to the plain municipalityId clause when includeChildren resolves no child zones", async () => {
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([]);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.patrolTracks.inRange({
      municipalityId: "muni-1",
      includeChildren: true,
    });

    const call = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0];
    expect(call?.where?.patrol).toMatchObject({ municipalityId: "muni-1" });
    expect(call?.where?.patrol).not.toHaveProperty("OR");
  });

  it("never resolves child zones when includeChildren is falsy", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.patrolTracks.inRange({ municipalityId: "muni-1" });

    expect(prisma.protectedZone.findMany).not.toHaveBeenCalled();
  });
});

// Fixtures for includeTraversing province-rollup tests (below) — two
// adjacent unit squares so a straight track crossing the shared edge splits
// ~50/50 by raw clip fraction (mirrors traversing-coverage.test.ts).
const TRAVERSING_SQUARE_A = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};
const TRAVERSING_SQUARE_B = {
  type: "Polygon",
  coordinates: [
    [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 0],
    ],
  ],
};
// Half inside A (x: 0.5→1.0), half inside B (x: 1.0→1.5). `clipTrackAcrossMembers`
// reads the raw LineString geometry directly (turf-friendly), but
// `pointsFromTrackGeojson` (used to build `points` for the map) expects the
// stored FeatureCollection wrapper — same trackGeojson value passed to both.
const TRAVERSING_CROSSING_TRACK = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [0.5, 0.5],
          [1.5, 0.5],
        ],
      },
    },
  ],
};

describe("map.patrolTracks.inRange includeTraversing (province rollup, W6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns per-track insideKm/traversing for a province-scoped candidate set, crediting the non-origin member (attributed && traversing both true)", async () => {
    // municipality.findMany is called TWICE: once by resolveMunicipalityScope
    // (province lookup — where.province set), once by the includeTraversing
    // branch's own geometry lookup (where.id.in set).
    vi.mocked(prisma.municipality.findMany).mockImplementation(
      ((args?: { where?: { province?: unknown; id?: { in?: string[] } } }) => {
        if (args?.where?.province !== undefined) {
          return Promise.resolve([{ id: "muni-a" }, { id: "muni-b" }]);
        }
        return Promise.resolve([
          { id: "muni-a", boundaryGeojson: TRAVERSING_SQUARE_A, waterGeojson: null },
          { id: "muni-b", boundaryGeojson: TRAVERSING_SQUARE_B, waterGeojson: null },
        ]);
      }) as unknown as typeof prisma.municipality.findMany,
    );
    // The origin-attributed half of the traversing result is now selected by
    // the REAL scope where-clause (a patrol.findMany over `patrolWhere`)
    // rather than a bare `municipalityIds.includes(origin)`. patrol-1's origin
    // muni-a is in the province scope, so it comes back attributed.
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([{ id: "patrol-1" }] as any);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: TRAVERSING_CROSSING_TRACK,
        patrol: {
          id: "patrol-1",
          title: "Cross-boundary sweep",
          patrolType: "seaborne",
          municipalityId: "muni-a", // origin IS in the province scope
          computedDurationHours: 4,
          totalHours: null,
          computedDistanceKm: 10,
          totalDistanceKm: null,
        },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.inRange({
      province: "Oriental Mindoro",
      includeTraversing: true,
    });

    expect(result.tracks).toHaveLength(1);
    const [track] = result.tracks;
    if (!track) throw new Error("expected patrolTracks.inRange fixture track");
    expect(track.patrolId).toBe("patrol-1");
    // Attributed (origin muni-a is a province member) AND traversing (also
    // crosses muni-b, the other member) — NOT mutually exclusive at
    // province scope.
    expect(track.attributed).toBe(true);
    expect(track.traversing).toBe(true);
    expect(track.insideKm).toBeGreaterThan(0);
    expect(track.insideHoursEst).toBeGreaterThan(0);
  });

  it("excludes a track whose patrol is neither attributed to nor traversing any scope member", async () => {
    vi.mocked(prisma.municipality.findMany).mockImplementation(
      ((args?: { where?: { province?: unknown; id?: { in?: string[] } } }) => {
        if (args?.where?.province !== undefined) {
          return Promise.resolve([{ id: "muni-a" }, { id: "muni-b" }]);
        }
        return Promise.resolve([
          { id: "muni-a", boundaryGeojson: TRAVERSING_SQUARE_A, waterGeojson: null },
          { id: "muni-b", boundaryGeojson: TRAVERSING_SQUARE_B, waterGeojson: null },
        ]);
      }) as unknown as typeof prisma.municipality.findMany,
    );
    // Origin muni-far is outside the province scope, so the scope
    // where-clause selects nothing — the patrol is not attributed.
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        // Far-away track that never touches A or B, and an origin outside
        // the province — neither attributed nor traversing.
        trackGeojson: {
          type: "LineString",
          coordinates: [
            [20, 20],
            [21, 21],
          ],
        },
        patrol: {
          id: "patrol-elsewhere",
          title: "Unrelated patrol",
          patrolType: "foot",
          municipalityId: "muni-far",
          computedDurationHours: 2,
          totalHours: null,
          computedDistanceKm: 5,
          totalDistanceKm: null,
        },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.inRange({
      province: "Oriental Mindoro",
      includeTraversing: true,
    });

    expect(result.tracks).toEqual([]);
  });
});

describe("map.patrolAreas.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active patrol areas for the tenant", async () => {
    vi.mocked(prisma.patrolArea.findMany).mockResolvedValue([
      {
        id: "pa-1",
        name: "Zone A",
        patrolType: "seaborne",
        polygonGeojson: { type: "Polygon", coordinates: [[]] },
        colorHex: "#ff0000",
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolAreas.list({ activeOnly: true });

    expect(result).toHaveLength(1);
    const findManyCall = vi.mocked(prisma.patrolArea.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      isActive: true,
    });
  });

  it("scopes to tenant and excludes inactive areas only when requested", async () => {
    vi.mocked(prisma.patrolArea.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.patrolAreas.list({ activeOnly: false });

    const findManyCall = vi.mocked(prisma.patrolArea.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ tenantId: "other-tenant" });
    expect(findManyCall?.where).not.toHaveProperty("isActive");
  });
});

describe("map.eventTypes.byCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits law/monitoring types and orders each canonically (unlisted last)", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);
    // Returned shuffled and across both categories; the DB `where` (mocked away)
    // filters to law + monitoring, so only those rows are returned here.
    vi.mocked(prisma.eventType.findMany).mockResolvedValue([
      {
        id: "t-comp",
        display: "Compressor Fishing",
        category: "law-enforcement-and-apprehensions",
      },
      {
        id: "t-zz",
        display: "Zz Unlisted Law Type",
        category: "law-enforcement-and-apprehensions",
      },
      {
        id: "t-unreg",
        display: "Unregistered Illegal Fishing",
        category: "law-enforcement-and-apprehensions",
      },
      {
        id: "t-comm",
        display: "Community Support",
        category: "monitoring_patrolling_and_surveillance",
      },
      {
        id: "t-wild",
        display: "Marine wildlife sightings",
        category: "monitoring_patrolling_and_surveillance",
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventTypes.byCategory();

    // Canonical: Unregistered (0) → Compressor (4) → unlisted appended alpha.
    expect(result.lawEnforcement.map((t) => t.display)).toEqual([
      "Unregistered Illegal Fishing",
      "Compressor Fishing",
      "Zz Unlisted Law Type",
    ]);
    // Canonical: Marine wildlife (0) → Community Support (3).
    expect(result.monitoring.map((t) => t.display)).toEqual([
      "Marine wildlife sightings",
      "Community Support",
    ]);
    // Each entry carries the toggle id.
    expect(result.lawEnforcement[0]).toMatchObject({ id: "t-unreg" });
  });

  it("scopes to the authenticated tenant + active law/monitoring categories", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);
    vi.mocked(prisma.eventType.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.eventTypes.byCategory();

    const findManyCall = vi.mocked(prisma.eventType.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: "other-tenant",
      isActive: true,
      category: {
        in: [
          "law-enforcement-and-apprehensions",
          "monitoring_patrolling_and_surveillance",
        ],
      },
    });
  });

  it("attaches L3 types[] derived from actual events, with counts incl. (Unspecified)", async () => {
    vi.mocked(prisma.eventType.findMany).mockResolvedValue([
      {
        id: "t-mpa",
        display: "Fishing in a prohibited area (MPA)",
        category: "law-enforcement-and-apprehensions",
      },
      {
        id: "t-wild",
        display: "Marine wildlife sightings",
        category: "monitoring_patrolling_and_surveillance",
      },
    ] as any);

    // MPA reads its curated key fishinginaprohibitedareampa_fishinggear;
    // monitoring reads "species". One MPA event has no Type → (Unspecified).
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        eventTypeId: "t-mpa",
        eventDetailsJson: {
          fishinginaprohibitedareampa_fishinggear: "Spear Fishing",
        },
      },
      {
        eventTypeId: "t-mpa",
        eventDetailsJson: {
          fishinginaprohibitedareampa_fishinggear: "Spear Fishing",
        },
      },
      { eventTypeId: "t-mpa", eventDetailsJson: {} }, // (Unspecified)
      { eventTypeId: "t-wild", eventDetailsJson: { species: "turtles" } },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventTypes.byCategory();

    // Scopes the L3 event scan to tenant + the two categories.
    const evCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(evCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      eventType: {
        category: {
          in: [
            "law-enforcement-and-apprehensions",
            "monitoring_patrolling_and_surveillance",
          ],
        },
      },
    });

    const mpa = result.lawEnforcement.find((t) => t.id === "t-mpa");
    expect(mpa?.types).toEqual([
      { value: "Spear Fishing", count: 2 },
      { value: "(Unspecified)", count: 1 },
    ]);
    const wild = result.monitoring.find((t) => t.id === "t-wild");
    expect(wild?.types).toEqual([{ value: "turtles", count: 1 }]);
  });
});
