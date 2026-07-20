import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Shared ReportScope resolver tests.
 *
 * The `buildScopeWhere` block is the POINT of this slice: it asserts DEEP
 * EQUALITY against a verbatim re-implementation of today's
 * `reportMap.ts` eventWhere/patrolWhere scope logic, proving the shared
 * resolver moves no numbers anywhere.
 *
 * Prisma is mocked with EVERY method these code paths touch (repo lesson:
 * a partial prisma mock factory blows up on the first undeclared method).
 */

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: { findMany: vi.fn() },
    protectedZone: { findMany: vi.fn() },
  },
}));

import { prisma } from "@marine-guardian/db";

import { buildMunicipalityScopeWhere } from "../municipality-scope";
import {
  buildScopeWhere,
  loadScopeGeometries,
  resolveReportScope,
  type ReportScope,
} from "../report-scope";

/**
 * The mock fns are typed loosely on purpose: the tests feed partial rows that
 * match each `select`, not full Prisma model rows, so the generated delegate
 * return types would reject them.
 */
type LooseMock = ReturnType<typeof vi.fn>;
const muniFindMany = prisma.municipality.findMany as unknown as LooseMock;
const zoneFindMany = prisma.protectedZone.findMany as unknown as LooseMock;

const TENANT = "tenant-1";

/**
 * VERBATIM re-implementation of the scope portion of today's
 * `reportMap.ts` eventWhere/patrolWhere (read at lines ~95-175). Kept
 * deliberately literal — this is the reference the new resolver must match.
 */
function todayScopeWhere(
  input: { protectedZoneId?: string | undefined },
  municipalityIds?: string[],
  childZoneIds?: string[],
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (municipalityIds !== undefined) {
    const scope = buildMunicipalityScopeWhere(municipalityIds, childZoneIds);
    if ("OR" in scope) where.OR = scope.OR;
    else where.municipalityId = scope.municipalityId;
  }
  if (input.protectedZoneId !== undefined) {
    where.coveredZones = { some: { protectedZoneId: input.protectedZoneId } };
  }
  return where;
}

beforeEach(() => {
  vi.clearAllMocks();
  muniFindMany.mockResolvedValue([]);
  zoneFindMany.mockResolvedValue([]);
});

describe("resolveReportScope — level", () => {
  it("is 'tenant' when neither province, municipality nor zone is set", async () => {
    const scope = await resolveReportScope(TENANT, {});
    expect(scope.level).toBe("tenant");
    expect(scope.municipalityIds).toBeUndefined();
  });

  it("is 'province' when only province is set", async () => {
    muniFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    const scope = await resolveReportScope(TENANT, { province: "Mindoro" });
    expect(scope.level).toBe("province");
    expect(scope.municipalityIds).toEqual(["m1", "m2"]);
  });

  it("is 'municipality' when a municipalityId is set", async () => {
    const scope = await resolveReportScope(TENANT, { municipalityId: "m1" });
    expect(scope.level).toBe("municipality");
    expect(scope.municipalityIds).toEqual(["m1"]);
  });

  it("is 'zone' when a protectedZoneId is set (smallest explicit boundary wins)", async () => {
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      protectedZoneId: "z1",
    });
    expect(scope.level).toBe("zone");
  });
});

describe("resolveReportScope — municipality resolution", () => {
  it("lets municipalityId win over province (no province lookup at all)", async () => {
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      province: "Mindoro",
    });
    expect(scope.municipalityIds).toEqual(["m1"]);
    expect(muniFindMany).not.toHaveBeenCalled();
  });
});

describe("resolveReportScope — childZoneIds", () => {
  it("is [] when includeChildren is false", async () => {
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeChildren: false,
    });
    expect(scope.childZoneIds).toEqual([]);
    expect(zoneFindMany).not.toHaveBeenCalled();
  });

  it("is [] when there is no municipality scope, even with includeChildren on", async () => {
    const scope = await resolveReportScope(TENANT, { includeChildren: true });
    expect(scope.municipalityIds).toBeUndefined();
    expect(scope.childZoneIds).toEqual([]);
    expect(zoneFindMany).not.toHaveBeenCalled();
  });

  it("is populated when includeChildren is on AND a municipality scope exists", async () => {
    zoneFindMany.mockResolvedValue([{ id: "z1" }, { id: "z2" }]);
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeChildren: true,
    });
    expect(scope.childZoneIds).toEqual(["z1", "z2"]);
  });
});

describe("resolveReportScope — scopeZoneIds", () => {
  it("prefers the explicitly selected zone over the child-zone rollup", async () => {
    zoneFindMany.mockResolvedValue([{ id: "z1" }, { id: "z2" }]);
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeChildren: true,
      protectedZoneId: "z9",
    });
    expect(scope.selectedZoneId).toBe("z9");
    expect(scope.scopeZoneIds).toEqual(["z9"]);
  });

  it("falls back to childZoneIds when no zone is explicitly selected", async () => {
    zoneFindMany.mockResolvedValue([{ id: "z1" }, { id: "z2" }]);
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeChildren: true,
    });
    expect(scope.scopeZoneIds).toEqual(["z1", "z2"]);
  });
});

/**
 * The full-traversing mode is opt-in and ZONE SCOPE ONLY (owner guardrail).
 * `resolveReportScope` is the SINGLE enforcement point for that gate, so these
 * cases pin it here rather than at each downstream consumer.
 */
describe("includeTraversingFull zone-scope gate", () => {
  it("is true only when the flag is set AND a zone is selected", async () => {
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      protectedZoneId: "z9",
      includeTraversingFull: true,
    });
    expect(scope.level).toBe("zone");
    expect(scope.includeTraversingFull).toBe(true);
  });

  it("is false at municipality scope even when the flag is set", async () => {
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeTraversingFull: true,
    });
    expect(scope.level).toBe("municipality");
    expect(scope.includeTraversingFull).toBe(false);
  });

  it("is false at province scope even when the flag is set", async () => {
    muniFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    const scope = await resolveReportScope(TENANT, {
      province: "Mindoro",
      includeTraversingFull: true,
    });
    expect(scope.level).toBe("province");
    expect(scope.includeTraversingFull).toBe(false);
  });

  it("is false at tenant scope even when the flag is set", async () => {
    const scope = await resolveReportScope(TENANT, {
      includeTraversingFull: true,
    });
    expect(scope.level).toBe("tenant");
    expect(scope.includeTraversingFull).toBe(false);
  });

  it("defaults to false when the flag is omitted, even with a zone selected", async () => {
    const scope = await resolveReportScope(TENANT, { protectedZoneId: "z9" });
    expect(scope.level).toBe("zone");
    expect(scope.includeTraversingFull).toBe(false);
  });

  it("is false when the flag is explicitly false with a zone selected", async () => {
    const scope = await resolveReportScope(TENANT, {
      protectedZoneId: "z9",
      includeTraversingFull: false,
    });
    expect(scope.includeTraversingFull).toBe(false);
  });

  it("does not disturb includeTraversing (the two modes are independent flags)", async () => {
    const scope = await resolveReportScope(TENANT, {
      protectedZoneId: "z9",
      includeTraversing: true,
      includeTraversingFull: true,
    });
    expect(scope.includeTraversing).toBe(true);
    expect(scope.includeTraversingFull).toBe(true);
  });
});

describe("buildScopeWhere — deep-equal to today's reportMap where clause", () => {
  it("(a) tenant scope produces the same empty scope clause", async () => {
    const scope = await resolveReportScope(TENANT, {});
    expect(buildScopeWhere(scope)).toEqual(todayScopeWhere({}, undefined, []));
  });

  it("(b) province only", async () => {
    muniFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    const scope = await resolveReportScope(TENANT, { province: "Mindoro" });
    expect(buildScopeWhere(scope)).toEqual(
      todayScopeWhere({}, ["m1", "m2"], []),
    );
  });

  it("(c) municipality only", async () => {
    const scope = await resolveReportScope(TENANT, { municipalityId: "m1" });
    expect(buildScopeWhere(scope)).toEqual(todayScopeWhere({}, ["m1"], []));
  });

  it("(d) municipality + includeChildren WITH children widens to the OR", async () => {
    zoneFindMany.mockResolvedValue([{ id: "z1" }, { id: "z2" }]);
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeChildren: true,
    });
    const expected = todayScopeWhere({}, ["m1"], ["z1", "z2"]);
    expect(buildScopeWhere(scope)).toEqual(expected);
    expect(Object.keys(expected)).toContain("OR");
  });

  it("(e) municipality + includeChildren with NO children collapses to the plain clause", async () => {
    zoneFindMany.mockResolvedValue([]);
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeChildren: true,
    });
    expect(buildScopeWhere(scope)).toEqual(todayScopeWhere({}, ["m1"], []));
    expect(buildScopeWhere(scope)).toEqual({ municipalityId: "m1" });
  });

  it("(f) municipality + zone + includeChildren keeps BOTH the OR key and the coveredZones key (they AND)", async () => {
    zoneFindMany.mockResolvedValue([{ id: "z1" }]);
    const scope = await resolveReportScope(TENANT, {
      municipalityId: "m1",
      includeChildren: true,
      protectedZoneId: "z9",
    });
    const actual = buildScopeWhere(scope);
    expect(actual).toEqual(
      todayScopeWhere({ protectedZoneId: "z9" }, ["m1"], ["z1"]),
    );
    expect(Object.keys(actual).sort()).toEqual(["OR", "coveredZones"]);
  });
});

describe("loadScopeGeometries", () => {
  const zoneScope: ReportScope = {
    level: "zone",
    municipalityIds: ["m1"],
    childZoneIds: [],
    selectedZoneId: "z9",
    scopeZoneIds: ["z9"],
    includeTraversing: false,
    includeTraversingFull: false,
    includeChildren: false,
  };

  it("returns zone-only members when level is 'zone' (never the parent municipality)", async () => {
    zoneFindMany.mockResolvedValue([
      {
        id: "z9",
        name: "Apo Reef Natural Park",
        boundaryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120.4, 12.2],
              [120.56, 12.2],
              [120.56, 12.4],
              [120.4, 12.4],
              [120.4, 12.2],
            ],
          ],
        },
      },
    ]);

    const members = await loadScopeGeometries(TENANT, zoneScope);

    expect(muniFindMany).not.toHaveBeenCalled();
    expect(members).toHaveLength(1);
    expect(members[0]?.kind).toBe("zone");
    expect(members[0]?.id).toBe("z9");
    // ProtectedZone has no water polygon column — boundary IS the water polygon.
    expect(members[0]?.waterGeojson).toBeNull();
    expect(members[0]?.bbox).toEqual([120.4, 12.2, 120.56, 12.4]);
  });

  it("returns municipalities AND child zones at municipality level with children", async () => {
    muniFindMany.mockResolvedValue([
      {
        id: "m1",
        name: "Sablayan",
        boundaryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120.62, 12.0],
              [121.4, 12.0],
              [121.4, 12.9],
              [120.62, 12.9],
              [120.62, 12.0],
            ],
          ],
        },
        waterGeojson: null,
      },
    ]);
    zoneFindMany.mockResolvedValue([
      {
        id: "z1",
        name: "Child MPA",
        boundaryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120.7, 12.1],
              [120.8, 12.1],
              [120.8, 12.2],
              [120.7, 12.2],
              [120.7, 12.1],
            ],
          ],
        },
      },
    ]);

    const members = await loadScopeGeometries(TENANT, {
      level: "municipality",
      municipalityIds: ["m1"],
      childZoneIds: ["z1"],
      selectedZoneId: undefined,
      scopeZoneIds: ["z1"],
      includeTraversing: false,
      includeTraversingFull: false,
      includeChildren: true,
    });

    expect(members.map((m) => m.kind)).toEqual(["municipality", "zone"]);
  });
});
