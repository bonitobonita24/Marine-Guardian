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

/**
 * `sumTraversingCoverageAcrossMembers` is wrapped in a spy that DELEGATES to
 * the real implementation, so every existing clipped-path assertion below
 * keeps exercising real geometry while invariant 6 can additionally prove the
 * function is NOT REACHED in full mode. A plain `vi.fn()` stub would silently
 * hollow out invariants 1 and 5; the delegation is what keeps them honest.
 */
vi.mock("../traversing-coverage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../traversing-coverage")>();
  return {
    ...actual,
    sumTraversingCoverageAcrossMembers: vi.fn(actual.sumTraversingCoverageAcrossMembers),
  };
});

import { prisma } from "@marine-guardian/db";

import { createCallerFactory } from "../../trpc/trpc";
import { reportMapRouter } from "../../trpc/routers/reportMap";
import { buildScopeWhere, resolveReportScope, type ScopeWhere } from "../report-scope";
import {
  bboxOfGeojson,
  clipTrackAcrossMembers,
  sumTraversingCoverageAcrossMembers,
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
const TRAVERSER_PATROL_ID = "patrol-traverser";

const TRACK_ROWS = [
  {
    trackGeojson: track,
    patrol: {
      // id/title/patrolType/municipality are additive fixture fields required
      // by `collectFullTraversingPatrols`'s select (it labels its rows). The
      // clipped path ignores them entirely, so adding them changes no existing
      // assertion.
      id: TRAVERSER_PATROL_ID,
      title: "Sablayan → Apo Reef transit",
      patrolType: "seaborne",
      municipality: { name: "Somewhere Else" },
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
  includeTraversingFull?: boolean | undefined;
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
async function runSummary(
  input: SummaryInput,
  /**
   * Rows returned by `prisma.patrol.findMany`. The summary issues that call
   * TWICE in full mode — once for the attributed distance/hours totals, once
   * for the full-traversing EXCLUSION SET — deliberately against the SAME
   * where-clause, so one fixture list correctly answers both. Seeding a patrol
   * here therefore makes it both already-counted AND excluded from the full
   * pass, which is exactly the double-credit case invariant 7 probes.
   */
  attributedPatrols: readonly unknown[] = [],
): Promise<SummaryProbe> {
  seedMocks();
  vi.mocked(prisma.patrol.findMany).mockResolvedValue(attributedPatrols as any);
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

// ===========================================================================
// INVARIANT 6 — includeTraversingFull IS INERT UNLESS ON, AT ZONE SCOPE
// ===========================================================================

/**
 * NOTE ON NUMBERING: the slice brief called this block "INVARIANT 3". That
 * number was already taken (scope monotonicity), as were 4 and 5, so these
 * continue the file's existing sequence at 6 and 7 rather than colliding with
 * a live invariant. The assertions are the ones the brief specified.
 */
describe("INVARIANT 6: includeTraversingFull changes nothing unless it is ON at zone scope", () => {
  /**
   * GUARDRAIL 1 (default OFF) and GUARDRAIL 2/3 (zone scope only; the
   * count-at-origin rule is untouched everywhere else). The mode is an opt-in
   * exception at ONE scope level — anywhere else it must be perfectly inert,
   * down to the exact where-clauses issued.
   */
  it("undefined === false at zone scope (default OFF is a true no-op)", async () => {
    const zone: SummaryInput = { municipalityId: MUNI_WITH_CHILD, protectedZoneId: ZONE };
    const absent = await runSummary({ ...zone });
    const explicitlyOff = await runSummary({ ...zone, includeTraversingFull: false });

    expect(explicitlyOff).toStrictEqual(absent);
  });

  // Every scope level EXCEPT zone — the four the flag must be inert at.
  const NON_ZONE_LEVELS: Array<{ label: string; input: SummaryInput }> = [
    { label: "tenant", input: {} },
    { label: "province", input: { province: PROVINCE } },
    { label: "municipality", input: { municipalityId: MUNI_WITH_CHILD } },
    {
      label: "municipality+children",
      input: { municipalityId: MUNI_WITH_CHILD, includeChildren: true },
    },
  ];

  it.each(NON_ZONE_LEVELS)(
    "$label — flag ON is byte-identical to baseline (NON-zone scopes are gated out)",
    async ({ input }) => {
      const baseline = await runSummary({ ...input });
      const flagged = await runSummary({ ...input, includeTraversingFull: true });

      expect(flagged).toStrictEqual(baseline);
    },
  );

  it("NON-zone scope with the flag ON leaves the count-at-origin rule intact even with traversing ON", async () => {
    // The rule this whole feature is an exception to must survive at every
    // level the exception does not apply to.
    const clipped = await runSummary({
      municipalityId: MUNI_WITH_CHILD,
      includeTraversing: true,
    });
    const clippedPlusFlag = await runSummary({
      municipalityId: MUNI_WITH_CHILD,
      includeTraversing: true,
      includeTraversingFull: true,
    });

    expect(clippedPlusFlag).toStrictEqual(clipped);
    // ANTI-VACUITY: the clipped path really did credit something, so the
    // equality above is not two zeroes agreeing.
    expect(clipped.totalDistanceKm).toBeGreaterThan(0);
  });
});

// ===========================================================================
// INVARIANT 7 — AT ZONE SCOPE THE MODE CREDITS IN FULL, EXACTLY ONCE
// ===========================================================================

const ZONE_INPUT: SummaryInput = {
  municipalityId: MUNI_WITH_CHILD,
  protectedZoneId: ZONE,
};

/** The traversing patrol as the ATTRIBUTED read sees it (distance/hours cols). */
const ATTRIBUTED_TRAVERSER = {
  id: TRAVERSER_PATROL_ID,
  totalDistanceKm: null,
  computedDistanceKm: 10,
  totalHours: null,
  computedDurationHours: 4,
};

describe("INVARIANT 7: at ZONE scope the flag credits FULL figures, exactly once", () => {
  it("totalPatrols, distance and hours ALL increase (count moves here by design)", async () => {
    const off = await runSummary(ZONE_INPUT);
    const on = await runSummary({ ...ZONE_INPUT, includeTraversingFull: true });

    // The owner's whole rationale: a patrol that merely ENTERS the zone is
    // counted, because none can ever start inside a small offshore MPA.
    expect(on.totalPatrols).toBe(off.totalPatrols + 1);
    // FULL figures — the patrol's whole 10 km / 4 h, transit included, NOT
    // the ~7.5 km the zone polygon clips out of the track.
    expect(on.totalDistanceKm).toBeCloseTo(off.totalDistanceKm + 10, 5);
    expect(on.totalHours).toBeCloseTo(off.totalHours + 4, 5);
  });

  it("credits the FULL patrol distance, NOT the clipped inside-zone portion", async () => {
    const clipped = await runSummary({ ...ZONE_INPUT, includeTraversing: true });
    const full = await runSummary({ ...ZONE_INPUT, includeTraversingFull: true });

    // The zone covers 0.6 of the track's 0.8 degrees → 7.5 clipped km.
    expect(clipped.totalDistanceKm).toBeCloseTo(7.5, 5);
    // Full mode supersedes that with the whole 10 km.
    expect(full.totalDistanceKm).toBeCloseTo(10, 5);
    // ...and only full mode moves the count.
    expect(clipped.totalPatrols).toBe(7);
    expect(full.totalPatrols).toBe(8);
  });

  it("DOUBLE-CREDIT GUARD: a patrol both ATTRIBUTED and crossing the zone is counted exactly ONCE", async () => {
    // The single highest-risk case in this feature. The patrol is already in
    // the attributed set (so its 10 km / 4 h are in the headline totals) AND
    // its track crosses the zone (so the full pass would otherwise re-add
    // them). The exclusion set — built from the SAME where-clause as the
    // attributed read — must suppress it entirely.
    const off = await runSummary(ZONE_INPUT, [ATTRIBUTED_TRAVERSER]);
    const on = await runSummary(
      { ...ZONE_INPUT, includeTraversingFull: true },
      [ATTRIBUTED_TRAVERSER],
    );

    expect(on.totalPatrols).toBe(off.totalPatrols);
    expect(on.totalDistanceKm).toBeCloseTo(off.totalDistanceKm, 5);
    expect(on.totalHours).toBeCloseTo(off.totalHours, 5);
    // Counted once, not twice: 10 km, never 20.
    expect(on.totalDistanceKm).toBeCloseTo(10, 5);
    expect(on.totalHours).toBeCloseTo(4, 5);
  });

  it("BRANCHES ARE EXCLUSIVE: with BOTH flags on, the clipped helper is never called", async () => {
    // Proves the if/else structurally, not just numerically — if the two
    // branches ever became independent `if`s this fails even when a fixture
    // happens to make the sums agree.
    const bothOn = await runSummary({
      ...ZONE_INPUT,
      includeTraversing: true,
      includeTraversingFull: true,
    });
    expect(vi.mocked(sumTraversingCoverageAcrossMembers)).not.toHaveBeenCalled();

    const fullOnly = await runSummary({ ...ZONE_INPUT, includeTraversingFull: true });
    expect(vi.mocked(sumTraversingCoverageAcrossMembers)).not.toHaveBeenCalled();

    // Totals are the full-mode-only totals — the clipped 7.5 km was NOT added.
    expect(bothOn.totalPatrols).toBe(fullOnly.totalPatrols);
    expect(bothOn.totalDistanceKm).toBeCloseTo(fullOnly.totalDistanceKm, 5);
    expect(bothOn.totalHours).toBeCloseTo(fullOnly.totalHours, 5);
    expect(bothOn.totalDistanceKm).toBeCloseTo(10, 5);
  });

  it("CONTRAST: the clipped branch DOES call the helper when only includeTraversing is on", async () => {
    // Anti-vacuity for the spy assertions above — proves the spy can observe
    // a call at all, so "not called" is a real signal.
    await runSummary({ ...ZONE_INPUT, includeTraversing: true });
    expect(vi.mocked(sumTraversingCoverageAcrossMembers)).toHaveBeenCalledTimes(1);
  });

  it("EVENTS stay untouched in full mode, exactly as in clipped mode", async () => {
    const off = await runSummary(ZONE_INPUT);
    const on = await runSummary({ ...ZONE_INPUT, includeTraversingFull: true });

    expect(on.totalEvents).toBe(off.totalEvents);
    expect(on.lawEnforcementEvents).toBe(off.lawEnforcementEvents);
    expect(on.monitoringEvents).toBe(off.monitoringEvents);
    expect(on.eventCountWheres).toStrictEqual(off.eventCountWheres);
  });
});
