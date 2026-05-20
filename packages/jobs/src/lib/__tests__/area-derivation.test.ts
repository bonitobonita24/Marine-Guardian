// 5.1b — applyAreaDerivation persistence helper tests.
//
// Verifies the helper:
//  (1) loads the target row via per-entity findUniqueOrThrow,
//  (2) loads enabled boundaries scoped to the row's tenant,
//  (3) calls deriveArea (5.1a pure function) and writes the result back,
//  (4) writes areaDerivedAt for Event/Patrol (schema has the column) but
//      NOT for FuelEntry (schema does not have the column).
//
// All prisma calls are mocked — no real DB I/O.
//
// 5.1c relocation note: moved from apps/web/src/server/sync/__tests__/ to
// packages/jobs/src/lib/__tests__/ alongside the relocated helper. Test
// content is identical — only the import path resolves to the new location.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyAreaDerivation, type PrismaClientLike } from "../area-derivation";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function makeBoundary(overrides: Partial<{
  id: string;
  name: string;
  aliases: string[];
  isEnabled: boolean;
  geometryType: "Polygon" | "LineString";
  geometryGeojson: Record<string, unknown>;
}> = {}) {
  return {
    id: overrides.id ?? "b1",
    name: overrides.name ?? "Tubbataha",
    aliases: overrides.aliases ?? [],
    isEnabled: overrides.isEnabled ?? true,
    geometryType: overrides.geometryType ?? "Polygon",
    geometryGeojson: overrides.geometryGeojson ?? {
      type: "Polygon",
      coordinates: [
        [
          [120.0, 8.0],
          [121.0, 8.0],
          [121.0, 9.0],
          [120.0, 9.0],
          [120.0, 8.0],
        ],
      ],
    },
  };
}

function makeMockPrisma() {
  return {
    event: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    patrol: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    fuelEntry: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    areaBoundary: {
      findMany: vi.fn(),
    },
  };
}

describe("applyAreaDerivation", () => {
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
  });

  it("event + name-match: writes areaBoundaryId + areaDerivedAt; returns matchedVia=name", async () => {
    mockPrisma.event.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: "Tubbataha",
      locationLat: null,
      locationLon: null,
    });
    mockPrisma.areaBoundary.findMany.mockResolvedValue([
      makeBoundary({ id: "b1", name: "Tubbataha" }),
    ]);
    mockPrisma.event.update.mockResolvedValue({});

    const result = await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "event",
      "evt-1",
    );

    expect(result).toEqual({ areaBoundaryId: "b1", matchedVia: "name" });
    expect(mockPrisma.event.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.event.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { areaBoundaryId: string | null; areaDerivedAt: Date };
    };
    expect(updateCall.where).toEqual({ id: "evt-1" });
    expect(updateCall.data.areaBoundaryId).toBe("b1");
    expect(updateCall.data.areaDerivedAt).toBeInstanceOf(Date);
  });

  it("event + nearest-fallback: returns matchedVia=nearest when point within 5km of polygon edge", async () => {
    // Polygon south edge runs lat=8.0 from lon=120.0 to lon=121.0.
    // Point at lat=8.04, lon=120.5 is ~4.4km north of that edge — within
    // the 5km default threshold.
    mockPrisma.event.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: null,
      locationLat: 8.04,
      locationLon: 120.5,
    });
    mockPrisma.areaBoundary.findMany.mockResolvedValue([
      makeBoundary({ id: "b2", name: "AnyName" }),
    ]);
    mockPrisma.event.update.mockResolvedValue({});

    const result = await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "event",
      "evt-2",
    );

    expect(result.matchedVia).toBe("nearest");
    expect(result.areaBoundaryId).toBe("b2");
  });

  it("event + no-match: writes areaBoundaryId=null AND areaDerivedAt timestamp", async () => {
    mockPrisma.event.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: "Unknown",
      locationLat: null,
      locationLon: null,
    });
    mockPrisma.areaBoundary.findMany.mockResolvedValue([
      makeBoundary({ id: "b3", name: "Tubbataha" }),
    ]);
    mockPrisma.event.update.mockResolvedValue({});

    const result = await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "event",
      "evt-3",
    );

    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
    expect(mockPrisma.event.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.event.update.mock.calls[0]?.[0] as {
      data: { areaBoundaryId: string | null; areaDerivedAt: Date };
    };
    expect(updateCall.data.areaBoundaryId).toBeNull();
    expect(updateCall.data.areaDerivedAt).toBeInstanceOf(Date);
  });

  it("patrol + name-match: select omits coordinate fields; writes areaDerivedAt", async () => {
    mockPrisma.patrol.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: "El Nido",
    });
    mockPrisma.areaBoundary.findMany.mockResolvedValue([
      makeBoundary({ id: "b4", name: "El Nido" }),
    ]);
    mockPrisma.patrol.update.mockResolvedValue({});

    const result = await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "patrol",
      "patrol-1",
    );

    expect(result).toEqual({ areaBoundaryId: "b4", matchedVia: "name" });

    // Verify the findUniqueOrThrow select did NOT request coordinate fields.
    const findCall = mockPrisma.patrol.findUniqueOrThrow.mock.calls[0]?.[0] as {
      select: Record<string, boolean>;
    };
    expect(findCall.select.tenantId).toBe(true);
    expect(findCall.select.areaName).toBe(true);
    expect(findCall.select.locationLat).toBeUndefined();
    expect(findCall.select.locationLon).toBeUndefined();

    // Verify update includes areaDerivedAt.
    const updateCall = mockPrisma.patrol.update.mock.calls[0]?.[0] as {
      data: { areaBoundaryId: string | null; areaDerivedAt: Date };
    };
    expect(updateCall.data.areaDerivedAt).toBeInstanceOf(Date);
  });

  it("fuelEntry + name-match: writes areaBoundaryId WITHOUT areaDerivedAt key", async () => {
    mockPrisma.fuelEntry.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: "Apo Reef",
    });
    mockPrisma.areaBoundary.findMany.mockResolvedValue([
      makeBoundary({ id: "b5", name: "Apo Reef" }),
    ]);
    mockPrisma.fuelEntry.update.mockResolvedValue({});

    const result = await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "fuelEntry",
      "fuel-1",
    );

    expect(result).toEqual({ areaBoundaryId: "b5", matchedVia: "name" });

    const updateCall = mockPrisma.fuelEntry.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data.areaBoundaryId).toBe("b5");
    expect("areaDerivedAt" in updateCall.data).toBe(false);
  });

  it("tenant isolation: areaBoundary.findMany scoped to the row's tenantId", async () => {
    mockPrisma.event.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: "Tubbataha",
      locationLat: null,
      locationLon: null,
    });
    mockPrisma.areaBoundary.findMany.mockResolvedValue([]);
    mockPrisma.event.update.mockResolvedValue({});

    await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "event",
      "evt-iso",
    );

    expect(mockPrisma.areaBoundary.findMany).toHaveBeenCalledTimes(1);
    const findCall = mockPrisma.areaBoundary.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; isEnabled: boolean };
    };
    expect(findCall.where).toEqual({ tenantId: TENANT_A, isEnabled: true });
    // Confirm tenant-B is not loaded.
    expect(findCall.where.tenantId).not.toBe(TENANT_B);
  });

  it("alias match: row areaName='TRNP' matches boundary with name='Tubbataha Reefs Natural Park' alias 'TRNP'", async () => {
    mockPrisma.event.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: "TRNP",
      locationLat: null,
      locationLon: null,
    });
    mockPrisma.areaBoundary.findMany.mockResolvedValue([
      makeBoundary({
        id: "b6",
        name: "Tubbataha Reefs Natural Park",
        aliases: ["TRNP"],
      }),
    ]);
    mockPrisma.event.update.mockResolvedValue({});

    const result = await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "event",
      "evt-alias",
    );

    expect(result).toEqual({ areaBoundaryId: "b6", matchedVia: "name" });
  });

  it("disabled boundary skipped: findMany filters by isEnabled=true", async () => {
    mockPrisma.event.findUniqueOrThrow.mockResolvedValue({
      tenantId: TENANT_A,
      areaName: "Tubbataha",
      locationLat: null,
      locationLon: null,
    });
    // findMany already filters by isEnabled=true at the DB layer, so we
    // return only enabled rows; the disabled row would never be returned.
    // The test verifies the WHERE clause requests isEnabled=true.
    mockPrisma.areaBoundary.findMany.mockResolvedValue([]);
    mockPrisma.event.update.mockResolvedValue({});

    await applyAreaDerivation(
      mockPrisma as unknown as PrismaClientLike,
      "event",
      "evt-disabled",
    );

    const findCall = mockPrisma.areaBoundary.findMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; isEnabled: boolean };
    };
    expect(findCall.where.isEnabled).toBe(true);
  });
});
