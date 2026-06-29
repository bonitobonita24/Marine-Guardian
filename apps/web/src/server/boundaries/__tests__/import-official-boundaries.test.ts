import { describe, it, expect, vi } from "vitest";
import {
  extractGeometry,
  importOfficialBoundaries,
} from "../import-official-boundaries";
import type { ExtendedPrismaClient } from "@marine-guardian/db";

describe("extractGeometry", () => {
  const polygon = { type: "Polygon", coordinates: [] };

  it("unwraps a single-feature FeatureCollection to bare geometry", () => {
    const fc = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: polygon, properties: {} }],
    };
    expect(extractGeometry(fc)).toEqual(polygon);
  });

  it("unwraps a Feature to bare geometry", () => {
    expect(
      extractGeometry({ type: "Feature", geometry: polygon, properties: {} }),
    ).toEqual(polygon);
  });

  it("returns a bare Polygon / MultiPolygon as-is", () => {
    expect(extractGeometry(polygon)).toEqual(polygon);
    const mp = { type: "MultiPolygon", coordinates: [] };
    expect(extractGeometry(mp)).toEqual(mp);
  });

  it("returns null for null, empty FeatureCollection, or unknown shapes", () => {
    expect(extractGeometry(null)).toBeNull();
    expect(extractGeometry({ type: "FeatureCollection", features: [] })).toBeNull();
    expect(extractGeometry({ type: "Point", coordinates: [0, 0] })).toBeNull();
    expect(extractGeometry("nope")).toBeNull();
  });
});

const polygon = { type: "Polygon", coordinates: [[[0, 0]]] };
const fc = (geom: unknown) => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: geom, properties: {} }],
});

interface CreateArg {
  data: {
    tenantId: string;
    source: string;
    region: string;
    arcgisReferenceId: string;
    geometryGeojson: { type: string };
  };
}

function makePrisma(overrides: {
  municipalities?: unknown[];
  zones?: unknown[];
  existingRefs?: Set<string>;
}) {
  const existingRefs = overrides.existingRefs ?? new Set<string>();
  const create = vi.fn<(arg: CreateArg) => Promise<unknown>>().mockResolvedValue({});
  const update = vi.fn<(arg: unknown) => Promise<unknown>>().mockResolvedValue({});
  const findFirst = vi.fn(
    ({ where }: { where: { arcgisReferenceId: string } }) =>
      existingRefs.has(where.arcgisReferenceId)
        ? Promise.resolve({ id: `id-${where.arcgisReferenceId}` })
        : Promise.resolve(null),
  );
  return {
    prisma: {
      municipality: {
        findMany: vi.fn().mockResolvedValue(overrides.municipalities ?? []),
      },
      protectedZone: {
        findMany: vi.fn().mockResolvedValue(overrides.zones ?? []),
      },
      areaBoundary: { findFirst, create, update },
    } as unknown as ExtendedPrismaClient,
    create,
    update,
  };
}

describe("importOfficialBoundaries", () => {
  it("creates land + water per municipality and one record per MPA", async () => {
    const { prisma, create, update } = makePrisma({
      municipalities: [
        {
          slug: "calapan-city",
          name: "Calapan City",
          province: "Oriental Mindoro",
          boundaryGeojson: fc(polygon),
          waterGeojson: fc({ type: "MultiPolygon", coordinates: [] }),
        },
      ],
      zones: [
        {
          slug: "apo-reef-natural-park",
          name: "Apo Reef Natural Park",
          boundaryGeojson: fc(polygon),
          parentMunicipality: { province: "Occidental Mindoro" },
        },
      ],
    });

    const res = await importOfficialBoundaries(prisma, "t1", "u1");

    expect(res).toEqual({ created: 3, updated: 0, total: 3 });
    expect(create).toHaveBeenCalledTimes(3);
    expect(update).not.toHaveBeenCalled();
    const refs = create.mock.calls.map((c) => c[0].data.arcgisReferenceId).sort();
    expect(refs).toEqual([
      "official:calapan-city:land",
      "official:calapan-city:water",
      "official:mpa:apo-reef-natural-park",
    ]);
    // every record is tenant-scoped + source official + extracted bare geometry
    for (const call of create.mock.calls) {
      expect(call[0].data.tenantId).toBe("t1");
      expect(call[0].data.source).toBe("official");
      expect(call[0].data.geometryGeojson.type).toMatch(/Polygon/);
    }
  });

  it("is idempotent — updates existing records instead of duplicating", async () => {
    const { prisma, create, update } = makePrisma({
      municipalities: [
        {
          slug: "baco",
          name: "Baco",
          province: "Oriental Mindoro",
          boundaryGeojson: fc(polygon),
          waterGeojson: null,
        },
      ],
      existingRefs: new Set(["official:baco:land"]),
    });

    const res = await importOfficialBoundaries(prisma, "t1", "u1");

    // land exists → update; no water (null) → skipped
    expect(res).toEqual({ created: 0, updated: 1, total: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("falls back to a region label for an MPA with no parent municipality", async () => {
    const { prisma, create } = makePrisma({
      zones: [
        {
          slug: "harka-piloto-mpa",
          name: "Harka Piloto",
          boundaryGeojson: fc(polygon),
          parentMunicipality: null,
        },
      ],
    });

    await importOfficialBoundaries(prisma, "t1", "u1");
    expect(create.mock.calls[0]?.[0].data.region).toBe("Protected Zone");
  });
});
