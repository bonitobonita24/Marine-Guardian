// @vitest-environment node
//
// Unit tests for municipality-assignment pure functions.
// Uses inline GeoJSON fixtures (no disk reads → no @types/node dependency,
// tsconfig's "include": ["src/**/*.ts"] excludes test files so node builtins
// would fail the typecheck). The fixtures are minimal valid Polygon features
// that bracket real Calapan City / Apo Reef coordinates.

import { describe, it, expect } from "vitest";
import {
  assignMunicipalityToPoint,
  assignZonesToPoint,
} from "../index.js";
import type { MunicipalityForAssignment, ProtectedZoneForAssignment } from "../types.js";

// ── Minimal Calapan City fixture ──────────────────────────────────────────────
// Calapan City centroid ≈ 13.3818°N 121.1948°E.
// The real polygon is roughly bounded by:
//   lon 121.10 – 121.30  lat 13.25 – 13.55
// We use a simple rectangle that contains the centroid.
const CALAPAN_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { shapeName: "Calapan City" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [121.10, 13.25],
            [121.30, 13.25],
            [121.30, 13.55],
            [121.10, 13.55],
            [121.10, 13.25],
          ],
        ],
      },
    },
  ],
};

// ── Minimal Apo Reef fixture ──────────────────────────────────────────────────
// Apo Reef bounding box per Senate Bill 2393 / OSM way 181365709:
//   lon 120.40 – 120.56  lat 12.60 – 12.75
// Centroid ≈ 12.6714°N 120.4792°E — inside this box.
const APO_REEF_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { shapeName: "Apo Reef Natural Park" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [120.40, 12.60],
            [120.56, 12.60],
            [120.56, 12.75],
            [120.40, 12.75],
            [120.40, 12.60],
          ],
        ],
      },
    },
  ],
};

const calapanMuni: MunicipalityForAssignment = {
  id: "muni-calapan",
  slug: "calapan-city",
  name: "Calapan City",
  boundaryGeojson: CALAPAN_GEOJSON,
};

const apoZone: ProtectedZoneForAssignment = {
  id: "zone-apo-reef",
  slug: "apo-reef-natural-park",
  name: "Apo Reef Natural Park",
  boundaryGeojson: APO_REEF_GEOJSON,
};

describe("assignMunicipalityToPoint", () => {
  it("returns the municipality id for a point inside Calapan City", () => {
    // Centroid of Calapan City — well inside the fixture polygon.
    const result = assignMunicipalityToPoint(
      { lat: 13.3818, lon: 121.1948 },
      [calapanMuni],
    );
    expect(result).toBe("muni-calapan");
  });

  it("returns null for a point in the open ocean (far from any boundary)", () => {
    // South China Sea — far outside any fixture polygon.
    const result = assignMunicipalityToPoint(
      { lat: 14.0, lon: 118.0 },
      [calapanMuni],
    );
    expect(result).toBeNull();
  });

  it("returns null when municipality list is empty", () => {
    const result = assignMunicipalityToPoint(
      { lat: 13.3818, lon: 121.1948 },
      [],
    );
    expect(result).toBeNull();
  });

  it("returns null for a point outside Calapan City (Manila)", () => {
    // Manila ≈ 14.5995°N 120.9842°E — outside the fixture rectangle.
    const result = assignMunicipalityToPoint(
      { lat: 14.5995, lon: 120.9842 },
      [calapanMuni],
    );
    expect(result).toBeNull();
  });

  it("returns first match when multiple municipalities share the same point", () => {
    // Two overlapping rectangles — should return the first one in the list.
    const muni2: MunicipalityForAssignment = {
      id: "muni-baco",
      slug: "baco",
      name: "Baco",
      boundaryGeojson: CALAPAN_GEOJSON, // same shape, different id
    };
    const result = assignMunicipalityToPoint(
      { lat: 13.3818, lon: 121.1948 },
      [calapanMuni, muni2],
    );
    // Returns the first hit only (Layer-1 is exclusive)
    expect(result).toBe("muni-calapan");
  });
});

describe("assignZonesToPoint", () => {
  it("returns zone id for a point inside Apo Reef Natural Park", () => {
    // Centroid of the Apo Reef bounding box.
    const result = assignZonesToPoint(
      { lat: 12.6714, lon: 120.4792 },
      [apoZone],
    );
    expect(result).toContain("zone-apo-reef");
  });

  it("returns empty array for a point outside every zone", () => {
    // Calapan City — far from Apo Reef.
    const result = assignZonesToPoint(
      { lat: 13.3818, lon: 121.1948 },
      [apoZone],
    );
    expect(result).toEqual([]);
  });

  it("returns empty array when zone list is empty", () => {
    const result = assignZonesToPoint({ lat: 12.6714, lon: 120.4792 }, []);
    expect(result).toEqual([]);
  });

  it("returns all matching zone ids when multiple zones contain the point", () => {
    const zone2: ProtectedZoneForAssignment = {
      id: "zone-other",
      slug: "other-zone",
      name: "Other Zone",
      boundaryGeojson: APO_REEF_GEOJSON, // same shape, different id
    };
    const result = assignZonesToPoint(
      { lat: 12.6714, lon: 120.4792 },
      [apoZone, zone2],
    );
    expect(result).toContain("zone-apo-reef");
    expect(result).toContain("zone-other");
    expect(result).toHaveLength(2);
  });
});
