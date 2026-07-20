/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
/**
 * CROSS-CUTTING SCOPE INVARIANTS — the assertions that span slices.
 *
 * Every other test in this workstream belongs to one slice and guards that
 * slice's own file. The five invariants below are owned by NO single slice,
 * which is precisely why they rot: each one can be broken by an innocuous
 * edit in a file whose own tests stay green. They are asserted here, once,
 * against the REAL `reportMapRouter` (through the established
 * `createCallerFactory` harness) and the REAL shared resolvers — not against
 * re-implementations.
 *
 * The five:
 *   1. COUNT-AT-ORIGIN — patrol COUNT never moves with `includeTraversing`.
 *   2. EVENTS ARE NEVER TRAVERSING-AFFECTED — event counts never move either.
 *   3. SCOPE MONOTONICITY — narrowing the scope never widens the result set.
 *   4. NO-CHILDREN NO-OP — `includeChildren` on a childless municipality is
 *      EXACTLY a no-op (14 of 16 dev municipalities per tenant are childless,
 *      so this is the COMMON path, not an edge case).
 *   5. NO PARENT/CHILD DOUBLE-COUNT — a zone CONTAINED in its parent credits
 *      its kilometres once, not twice.
 *
 * The `no-explicit-any` disable above matches the established convention in
 * `trpc/routers/__tests__/*.test.ts`: the vitest prisma mocks are fed partial
 * rows shaped to each `select`, which the generated Prisma delegate return
 * types reject. It covers the mock plumbing only — no production type is
 * loosened.
 *
 * Prisma is mocked with EVERY method these paths touch (repo lesson
 * `feedback_vitest_mock_factory_prisma_method_addition`: a partial mock
 * factory blows up on the first undeclared method).
 */
import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: { count: vi.fn(), findMany: vi.fn() },
    patrol: { count: vi.fn(), findMany: vi.fn() },
    patrolTrack: { findMany: vi.fn() },
    municipality: { findMany: vi.fn() },
    protectedZone: { findMany: vi.fn() },
  },
}));

vi.mock("../../../lib/rate-limit", () => ({
  rateLimiters: {
    public: { check: vi.fn() },
    api: { check: vi.fn() },
    auth: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("../../../auth", () => ({ auth: vi.fn() }));

import { prisma } from "@marine-guardian/db";

import { createCallerFactory } from "../../trpc/trpc";
import { reportMapRouter } from "../../trpc/routers/reportMap";
import { buildScopeWhere, resolveReportScope, type ScopeWhere } from "../report-scope";
import {
  bboxOfGeojson,
  clipTrackAcrossMembers,
  type TraversingMember,
  type TraversingPatrolMeta,
} from "../traversing-coverage";

const createCaller = createCallerFactory(reportMapRouter);

const TENANT = "tenant-abc";
const PROVINCE = "Occidental Mindoro";

/** The municipality that HAS a child zone (the dev shape: 2 of 16 do). */
const MUNI_WITH_CHILD = "muni-sablayan";
/** A municipality with NO child zones (the dev shape: 14 of 16). */
const MUNI_CHILDLESS = "muni-childless";
const ZONE = "zone-apo-reef";

// ---------------------------------------------------------------------------
// Geometry fixtures
// ---------------------------------------------------------------------------

/** Municipality polygon: the unit square (0,0)-(1,1). */
const muniSquare = {
  type: "Polygon",
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

/**
 * Zone polygon (0.2,0.2)-(0.8,0.8) — strictly CONTAINED in `muniSquare`.
 *
 * Containment is deliberate. The real Apo Reef / Sablayan pair is DISJOINT
 * (verified in the dev DB: Apo Reef lon 120.3961-120.5622 vs Sablayan water
 * lon 120.6225-121.3994), so an Apo-Reef-shaped fixture can never exercise the
 * parent/child overlap. The contained shape is the Harka Piloto Fish Sanctuary
 * / Calapan City pair (Harka lon 121.2185-121.2248 inside Calapan water lon
 * 121.1064-121.4277) — the case invariant 5 exists for.
 */
const zoneSquare = {
  type: "Polygon",
  coordinates: [[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]]],
};

/** Track from (0.1,0.5) to (0.9,0.5): wholly inside the municipality, and
 *  0.6 of its 0.8 degrees also inside the contained zone. */
const track = { type: "LineString", coordinates: [[0.1, 0.5], [0.9, 0.5]] };

const MUNI_ROWS = [
  {
    id: MUNI_WITH_CHILD,
    name: "Sablayan",
    province: PROVINCE,
    boundaryGeojson: muniSquare,
    waterGeojson: muniSquare,
  },
  {
    id: MUNI_CHILDLESS,
    name: "Childless",
    province: PROVINCE,
    boundaryGeojson: muniSquare,
    waterGeojson: muniSquare,
  },
];

const ZONE_ROWS = [
  {
    id: ZONE,
    name: "Apo Reef Natural Park",
    parentMunicipalityId: MUNI_WITH_CHILD,
    boundaryGeojson: zoneSquare,
  },
];

/**
 * A tracked patrol that ORIGINATED OUTSIDE the scope, so `includeTraversing`
 * genuinely credits it. Without this the ON/OFF comparisons would pass
 * vacuously (0 === 0) while proving nothing — every count invariant below is
 * paired with an explicit anti-vacuity assertion that distance DID move.
 */
const TRACK_ROWS = [
  {
    trackGeojson: track,
    patrol: {
      municipalityId: "muni-somewhere-else",
      totalHours: null,
      computedDurationHours: 4,
      computedDistanceKm: 10,
      totalDistanceKm: null,
      startLocationLat: 9,
      startLocationLon: 9,
    },
  },
];

/**
 * Explicitly typed as promise-RETURNING (rather than `ReturnType<typeof vi.fn>`,
 * whose default signature returns void) so the where-inspecting
 * `mockImplementation`s below satisfy `no-misused-promises`.
 */
type FindManyMock = Mock<(args: { where?: Record<string, unknown> }) => Promise<unknown[]>>;
const muniFindMany = prisma.municipality.findMany as unknown as FindManyMock;
const zoneFindMany = prisma.protectedZone.findMany as unknown as FindManyMock;

/**
 * Seeds every mock. The municipality/zone mocks are IMPLEMENTATION-based
 * because each is called with two different where-shapes per request
 * (`resolveMunicipalityScope` by province, `loadScopeGeometries` by id;
 * `resolveChildZoneIds` by parentMunicipalityId, `loadScopeGeometries` by id)
 * and the two must answer consistently or the scope silently disagrees with
 * its own geometry.
 */
function seedMocks(): void {
  vi.clearAllMocks();

  muniFindMany.mockImplementation((args: any) => {
    const where = args?.where ?? {};
    let rows = MUNI_ROWS;
    if (typeof where.province === "string") {
      rows = rows.filter((m) => m.province === where.province);
    }
    if (Array.isArray(where.id?.in)) {
      const ids: string[] = where.id.in;
      rows = rows.filter((m) => ids.includes(m.id));
    }
    return Promise.resolve(rows);
  });

  zoneFindMany.mockImplementation((args: any) => {
    const where = args?.where ?? {};
    let rows = ZONE_ROWS;
    if (Array.isArray(where.parentMunicipalityId?.in)) {
      const parents: string[] = where.parentMunicipalityId.in;
      rows = rows.filter((z) => parents.includes(z.parentMunicipalityId));
    }
    if (Array.isArray(where.id?.in)) {
      const ids: string[] = where.id.in;
      rows = rows.filter((z) => ids.includes(z.id));
    }
    return Promise.resolve(rows);
  });

  // Fixed counts: the POINT is that the same where-clause is issued, so the
  // returned number is irrelevant as long as it is stable across ON/OFF.
  vi.mocked(prisma.event.count)
    .mockResolvedValueOnce(40 as any)
    .mockResolvedValueOnce(12 as any)
    .mockResolvedValueOnce(25 as any)
    .mockResolvedValue(40 as any);
  vi.mocked(prisma.patrol.count).mockResolvedValue(7 as any);
  vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);
  vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue(TRACK_ROWS as any);
}

function makeCtx() {
  return {
    session: {
      user: {
        id: "user-123",
        tenantId: TENANT,
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

/**
 * `| undefined` on every key is required, not cosmetic: the package runs
 * `exactOptionalPropertyTypes: true`, and the "downline left at All" test
 * below deliberately passes an EXPLICIT `undefined` (that is what the filter
 * panel sends when a dropdown reads "All"), which a bare `?:` would reject.
 */
type SummaryInput = {
  municipalityId?: string | undefined;
  province?: string | undefined;
  protectedZoneId?: string | undefined;
  includeChildren?: boolean | undefined;
  includeTraversing?: boolean | undefined;
};

type SummaryProbe = {
  totalPatrols: number;
  totalEvents: number;
  lawEnforcementEvents: number;
  monitoringEvents: number;
  totalDistanceKm: number;
  totalHours: number;
  patrolCountWhere: unknown;
  eventCountWheres: unknown[];
};

/** Runs `reportMap.summary` against freshly-seeded mocks and captures both the
 *  returned numbers AND the exact where-clauses the counts were issued with. */
async function runSummary(input: SummaryInput): Promise<SummaryProbe> {
  seedMocks();
  const caller = createCaller(makeCtx());
  const result = await caller.summary(input);
  return {
    ...result,
    patrolCountWhere: vi.mocked(prisma.patrol.count).mock.calls[0]?.[0]?.where,
    eventCountWheres: vi
      .mocked(prisma.event.count)
      .mock.calls.map((c) => c[0]?.where),
  };
}

/**
 * The five scope levels, smallest-explicit-boundary ordered. `municipality+children`
 * is listed separately from `municipality` because the toggle changes the
 * where-clause shape (plain `municipalityId` widens to an `OR`).
 */
const SCOPE_LEVELS: Array<{ label: string; input: SummaryInput }> = [
  { label: "tenant", input: {} },
  { label: "province", input: { province: PROVINCE } },
  { label: "municipality", input: { municipalityId: MUNI_WITH_CHILD } },
  {
    label: "municipality+children",
    input: { municipalityId: MUNI_WITH_CHILD, includeChildren: true },
  },
  {
    label: "zone",
    input: { municipalityId: MUNI_WITH_CHILD, protectedZoneId: ZONE },
  },
];

// ===========================================================================
// INVARIANT 1 — COUNT-AT-ORIGIN
// ===========================================================================

describe("INVARIANT 1: patrol COUNT is unaffected by includeTraversing", () => {
  /**
   * The owner's explicit rule of thumb: "the patrol count must only for the
   * boundary where it started." Traversing may add TIME and DISTANCE; it may
   * never move a count. This is the single most important assertion in the
   * workstream — every other number is recoverable, a moved count silently
   * misreports enforcement activity.
   */
  it.each(SCOPE_LEVELS)(
    "$label — count identical, where-clause byte-identical, ON vs OFF",
    async ({ input }) => {
      const off = await runSummary({ ...input, includeTraversing: false });
      const on = await runSummary({ ...input, includeTraversing: true });

      expect(on.totalPatrols).toBe(off.totalPatrols);
      // Stronger than the number: the COUNT QUERY ITSELF must be identical,
      // so the invariant holds for every dataset, not just this fixture.
      expect(on.patrolCountWhere).toStrictEqual(off.patrolCountWhere);
      // And the where clause must never mention traversing in any form.
      expect(JSON.stringify(on.patrolCountWhere)).not.toMatch(/traversing/i);
    },
  );

  it("ANTI-VACUITY: traversing DOES move distance and hours where geometry exists", async () => {
    // Guards the tests above from passing because the toggle does nothing at
    // all. At municipality scope the out-of-scope-origin track must be credited.
    const off = await runSummary({
      municipalityId: MUNI_WITH_CHILD,
      includeTraversing: false,
    });
    const on = await runSummary({
      municipalityId: MUNI_WITH_CHILD,
      includeTraversing: true,
    });

    expect(off.totalDistanceKm).toBe(0);
    expect(on.totalDistanceKm).toBeGreaterThan(0);
    expect(on.totalHours).toBeGreaterThan(0);
    // ...while the count stayed put.
    expect(on.totalPatrols).toBe(off.totalPatrols);
  });
});

// ===========================================================================
// INVARIANT 2 — EVENTS ARE NEVER TRAVERSING-AFFECTED
// ===========================================================================

describe("INVARIANT 2: event counts are unaffected by includeTraversing", () => {
  /**
   * Traversing is a PATROL-TRACK concept — an event is a point, it does not
   * pass through anything. Today `includeTraversing` appears in no event
   * where-clause; this test is the guard that keeps it that way, because the
   * natural next "improvement" is to fold traversing into events too.
   */
  it.each(SCOPE_LEVELS)("$label — event counts + where-clauses identical", async ({ input }) => {
    const off = await runSummary({ ...input, includeTraversing: false });
    const on = await runSummary({ ...input, includeTraversing: true });

    expect(on.totalEvents).toBe(off.totalEvents);
    expect(on.lawEnforcementEvents).toBe(off.lawEnforcementEvents);
    expect(on.monitoringEvents).toBe(off.monitoringEvents);
    expect(on.eventCountWheres).toStrictEqual(off.eventCountWheres);
  });
});

// ===========================================================================
// INVARIANT 3 — SCOPE MONOTONICITY
// ===========================================================================

/** A fixture row as the scope where-clause sees it. */
type ScopedRow = { id: string; municipalityId: string | null; zoneIds: string[] };

/**
 * Evaluates a `ScopeWhere` against a fixture row — an in-memory stand-in for
 * Prisma covering exactly the operators `buildScopeWhere` emits
 * (`municipalityId` equality/`in`, the `OR` child widening, and
 * `coveredZones.some`). This turns invariant 3 into a real SET-INCLUSION
 * proof rather than a shape comparison.
 */
function matchesScope(row: ScopedRow, where: ScopeWhere): boolean {
  const muniMatches = (clause: string | { in: string[] } | undefined): boolean => {
    if (clause === undefined) return true;
    if (typeof clause === "string") return row.municipalityId === clause;
    return row.municipalityId !== null && clause.in.includes(row.municipalityId);
  };

  if (where.OR !== undefined) {
    const [byMuni, byZone] = where.OR;
    const zoneHit = row.zoneIds.some((z) =>
      byZone.coveredZones.some.protectedZoneId.in.includes(z),
    );
    if (!muniMatches(byMuni.municipalityId) && !zoneHit) return false;
  } else if (!muniMatches(where.municipalityId)) {
    return false;
  }

  if (where.coveredZones !== undefined) {
    if (!row.zoneIds.includes(where.coveredZones.some.protectedZoneId)) return false;
  }

  return true;
}

const SCOPED_ROWS: ScopedRow[] = [
  { id: "r-in-muni-and-zone", municipalityId: MUNI_WITH_CHILD, zoneIds: [ZONE] },
  { id: "r-in-muni-only", municipalityId: MUNI_WITH_CHILD, zoneIds: [] },
  { id: "r-in-childless-muni", municipalityId: MUNI_CHILDLESS, zoneIds: [] },
  { id: "r-in-zone-only", municipalityId: null, zoneIds: [ZONE] },
  { id: "r-outside-province", municipalityId: "muni-elsewhere", zoneIds: [] },
  { id: "r-unattributed", municipalityId: null, zoneIds: [] },
];

async function matchedIds(input: SummaryInput): Promise<Set<string>> {
  seedMocks();
  const scope = await resolveReportScope(TENANT, input);
  const where = buildScopeWhere(scope);
  return new Set(SCOPED_ROWS.filter((r) => matchesScope(r, where)).map((r) => r.id));
}

function isSubsetOf(inner: Set<string>, outer: Set<string>): boolean {
  for (const id of inner) {
    if (!outer.has(id)) return false;
  }
  return true;
}

describe("INVARIANT 3: scope monotonicity — narrowing never widens", () => {
  /**
   * Owner Rule 1: scope is ALWAYS the smallest boundary explicitly set, and a
   * downline left at "All" means "do not narrow at this level" — NOT "ignore
   * this level". So each explicit narrowing must produce a SUBSET.
   */
  it("tenant ⊇ province ⊇ municipality ⊇ municipality+zone", async () => {
    const tenant = await matchedIds({});
    const province = await matchedIds({ province: PROVINCE });
    const municipality = await matchedIds({ municipalityId: MUNI_WITH_CHILD });
    const zone = await matchedIds({
      municipalityId: MUNI_WITH_CHILD,
      protectedZoneId: ZONE,
    });

    expect(isSubsetOf(province, tenant)).toBe(true);
    expect(isSubsetOf(municipality, province)).toBe(true);
    expect(isSubsetOf(zone, municipality)).toBe(true);

    // ANTI-VACUITY: the chain must actually narrow, not be four identical sets.
    expect(tenant.size).toBeGreaterThan(province.size);
    expect(province.size).toBeGreaterThan(municipality.size);
    expect(municipality.size).toBeGreaterThan(zone.size);
  });

  it("a downline left at 'All' does NOT narrow: province+All === province", async () => {
    const province = await matchedIds({ province: PROVINCE });
    const provinceAllDownlines = await matchedIds({
      province: PROVINCE,
      municipalityId: undefined,
      protectedZoneId: undefined,
    });
    expect(provinceAllDownlines).toStrictEqual(province);
  });

  it("tenant scope applies NO boundary narrowing at all", async () => {
    seedMocks();
    const scope = await resolveReportScope(TENANT, {});
    expect(scope.level).toBe("tenant");
    expect(buildScopeWhere(scope)).toStrictEqual({});
  });

  it("the resolved level is always the SMALLEST explicitly-set boundary", async () => {
    seedMocks();
    const levels = await Promise.all(
      SCOPE_LEVELS.map(async ({ input }) => (await resolveReportScope(TENANT, input)).level),
    );
    expect(levels).toStrictEqual([
      "tenant",
      "province",
      "municipality",
      "municipality",
      "zone",
    ]);
  });
});

// ===========================================================================
// INVARIANT 4 — NO-CHILDREN NO-OP
// ===========================================================================

describe("INVARIANT 4: includeChildren on a childless municipality is a no-op", () => {
  /**
   * Verified against the dev DB: every tenant has 16 municipalities and only
   * 2 of them have any child zone, so 14 of 16 hit this path. It must be
   * EXACTLY a no-op — an empty child set that still widened the clause to an
   * `OR` would change the query plan and, with a stray join, the numbers.
   */
  it("resolver: where-clause is byte-identical with the toggle ON vs OFF", async () => {
    seedMocks();
    const off = buildScopeWhere(
      await resolveReportScope(TENANT, { municipalityId: MUNI_CHILDLESS }),
    );
    seedMocks();
    const on = buildScopeWhere(
      await resolveReportScope(TENANT, {
        municipalityId: MUNI_CHILDLESS,
        includeChildren: true,
      }),
    );

    expect(on).toStrictEqual(off);
    expect(on).toStrictEqual({ municipalityId: MUNI_CHILDLESS });
    expect(on).not.toHaveProperty("OR");
  });

  it("router: summary issues identical count queries with the toggle ON vs OFF", async () => {
    const off = await runSummary({ municipalityId: MUNI_CHILDLESS });
    const on = await runSummary({
      municipalityId: MUNI_CHILDLESS,
      includeChildren: true,
    });

    expect(on.patrolCountWhere).toStrictEqual(off.patrolCountWhere);
    expect(on.eventCountWheres).toStrictEqual(off.eventCountWheres);
    expect(on.totalPatrols).toBe(off.totalPatrols);
    expect(on.totalEvents).toBe(off.totalEvents);
  });

  it("CONTRAST: on a municipality that HAS children the toggle really does widen", async () => {
    // Proves the no-op above is a property of childlessness, not of a dead toggle.
    const off = await runSummary({ municipalityId: MUNI_WITH_CHILD });
    const on = await runSummary({
      municipalityId: MUNI_WITH_CHILD,
      includeChildren: true,
    });
    expect(on.patrolCountWhere).not.toStrictEqual(off.patrolCountWhere);
    expect(on.patrolCountWhere).toHaveProperty("OR");
  });
});

// ===========================================================================
// INVARIANT 5 — NO PARENT/CHILD DOUBLE-COUNT
// ===========================================================================

function member(
  id: string,
  kind: "municipality" | "zone",
  land: unknown,
): TraversingMember {
  return { id, kind, landGeojson: land, waterGeojson: undefined, bbox: bboxOfGeojson(land) };
}

const parentMuni = member(MUNI_WITH_CHILD, "municipality", muniSquare);
const containedZone = member(ZONE, "zone", zoneSquare);

const outsideOriginMeta: TraversingPatrolMeta = {
  originMunicipalityId: "muni-somewhere-else",
  computedDurationHours: 4,
  totalHours: null,
  computedDistanceKm: 10,
  totalDistanceKm: null,
  startLat: 9,
  startLon: 9,
};

describe("INVARIANT 5: a contained zone and its parent never double-count", () => {
  /**
   * A fixture built on Apo Reef would NOT catch this: Apo Reef is
   * geometrically DISJOINT from Sablayan (dev DB: Apo Reef lon max 120.5622 <
   * Sablayan water lon min 120.6225), so no overlap exists to double-count.
   * The shape that does overlap is Harka Piloto inside Calapan City, modelled
   * by `zoneSquare` inside `muniSquare`.
   */
  it("credited km equals the single-pass figure EXACTLY, not the sum", () => {
    const parentOnly = clipTrackAcrossMembers(track, [parentMuni], outsideOriginMeta);
    const zoneOnly = clipTrackAcrossMembers(track, [containedZone], outsideOriginMeta);
    const both = clipTrackAcrossMembers(
      track,
      [parentMuni, containedZone],
      outsideOriginMeta,
    );

    // The track lies wholly inside the parent → clip fraction 1 → the full
    // clean distance of 10 km.
    expect(parentOnly.insideKm).toBeCloseTo(10, 5);
    // The zone covers 0.6 of the track's 0.8 degrees → 7.5 km on its own.
    expect(zoneOnly.insideKm).toBeCloseTo(7.5, 5);

    // THE ASSERTION: the union credits 10, not 17.5.
    expect(both.insideKm).toBeCloseTo(10, 5);
    expect(both.insideKm).not.toBeCloseTo(parentOnly.insideKm + zoneOnly.insideKm, 1);
    expect(both.insideHoursEst).toBeCloseTo(parentOnly.insideHoursEst, 5);
  });

  it("member ORDER does not change the credited figure", () => {
    // Containment de-overlap must be order-independent, or the number depends
    // on the arbitrary order `loadScopeGeometries` happened to return rows in.
    const forward = clipTrackAcrossMembers(
      track,
      [parentMuni, containedZone],
      outsideOriginMeta,
    );
    const reverse = clipTrackAcrossMembers(
      track,
      [containedZone, parentMuni],
      outsideOriginMeta,
    );
    expect(reverse.insideKm).toBeCloseTo(forward.insideKm, 5);
  });

  it("a patrol originating in the parent credits NOTHING for the contained zone", () => {
    // Origin exclusion must cascade downward: kilometres inside a zone that
    // sits within the patrol's own origin municipality are origin kilometres.
    const result = clipTrackAcrossMembers(track, [parentMuni, containedZone], {
      ...outsideOriginMeta,
      originMunicipalityId: MUNI_WITH_CHILD,
    });
    expect(result.insideKm).toBe(0);
    expect(result.traversesNonOrigin).toBe(false);
  });
});
