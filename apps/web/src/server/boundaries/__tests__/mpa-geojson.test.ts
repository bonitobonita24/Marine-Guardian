import { describe, it, expect } from "vitest";
import {
  normalizeMpaGeometry,
  toFeatureCollection,
  slugifyMpaName,
  MpaGeometryError,
  MAX_MPA_VERTICES,
} from "../mpa-geojson";

// A small valid square ring (closed) near Mindoro waters.
const square: [number, number][] = [
  [120.4, 12.6],
  [120.5, 12.6],
  [120.5, 12.7],
  [120.4, 12.7],
  [120.4, 12.6],
];

function fc(geometry: unknown) {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry }],
  };
}

describe("normalizeMpaGeometry", () => {
  it("accepts a single-polygon FeatureCollection and returns a Polygon", () => {
    const res = normalizeMpaGeometry(fc({ type: "Polygon", coordinates: [square] }));
    expect(res.geometry.type).toBe("Polygon");
    expect(res.vertexCount).toBe(5);
    expect(res.bbox).toEqual([120.4, 12.6, 120.5, 12.7]);
  });

  it("merges multiple polygon features into a MultiPolygon", () => {
    const shifted: [number, number][] = square.map(([lon, lat]) => [lon + 1, lat + 1]);
    const input = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [square] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [shifted] } },
      ],
    };
    const res = normalizeMpaGeometry(input);
    expect(res.geometry.type).toBe("MultiPolygon");
    expect(res.geometry.coordinates).toHaveLength(2);
  });

  it("accepts a bare MultiPolygon and a GeometryCollection", () => {
    const mp = { type: "MultiPolygon", coordinates: [[square]] };
    expect(normalizeMpaGeometry(mp).geometry.type).toBe("Polygon"); // single poly collapses
    const gc = {
      type: "GeometryCollection",
      geometries: [{ type: "Polygon", coordinates: [square] }],
    };
    expect(normalizeMpaGeometry(gc).geometry.type).toBe("Polygon");
  });

  it("rejects geometry with no polygon (Point / LineString)", () => {
    expect(() => normalizeMpaGeometry(fc({ type: "Point", coordinates: [120, 12] }))).toThrow(
      MpaGeometryError,
    );
    expect(() =>
      normalizeMpaGeometry(fc({ type: "LineString", coordinates: [[120, 12], [121, 13]] })),
    ).toThrow(/No polygon/);
  });

  it("rejects a ring with fewer than 4 points", () => {
    const open: [number, number][] = [[120.4, 12.6], [120.5, 12.6], [120.5, 12.7]];
    expect(() => normalizeMpaGeometry(fc({ type: "Polygon", coordinates: [open] }))).toThrow(
      /fewer than 4/,
    );
  });

  it("rejects out-of-range coordinates", () => {
    const bad: [number, number][] = [
      [200, 12.6],
      [120.5, 12.6],
      [120.5, 12.7],
      [200, 12.6],
    ];
    expect(() => normalizeMpaGeometry(fc({ type: "Polygon", coordinates: [bad] }))).toThrow(
      /invalid coordinate/,
    );
  });

  it("rejects a boundary exceeding the vertex cap", () => {
    const huge: [number, number][] = Array.from({ length: MAX_MPA_VERTICES + 5 }, (_, i) => [
      120 + (i % 10) * 0.001,
      12 + (i % 10) * 0.001,
    ]);
    huge.push([120, 12]);
    expect(() => normalizeMpaGeometry(fc({ type: "Polygon", coordinates: [huge] }))).toThrow(
      /too detailed/,
    );
  });
});

describe("toFeatureCollection", () => {
  it("wraps a geometry as a single-feature FeatureCollection with properties", () => {
    const geom = { type: "Polygon" as const, coordinates: [square] };
    const wrapped = toFeatureCollection(geom, { name: "X" }) as {
      type: string;
      features: { properties: Record<string, unknown>; geometry: unknown }[];
    };
    expect(wrapped.type).toBe("FeatureCollection");
    expect(wrapped.features).toHaveLength(1);
    const feature = wrapped.features[0];
    expect(feature?.properties.name).toBe("X");
    expect(feature?.geometry).toEqual(geom);
  });
});

describe("slugifyMpaName", () => {
  it("lowercases, strips accents/symbols, and hyphenates", () => {
    expect(slugifyMpaName("Bañgon Reef Sanctuary #2!")).toBe("bangon-reef-sanctuary-2");
  });
  it("trims leading/trailing hyphens and caps length", () => {
    expect(slugifyMpaName("  --Apo Reef--  ")).toBe("apo-reef");
    expect(slugifyMpaName("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
