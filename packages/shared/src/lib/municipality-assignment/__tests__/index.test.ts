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
  assignMunicipalityToPointOrNearest,
  assignMunicipalityToDominantTrack,
  assignMunicipalityByContainment,
  assignMunicipalityToDominantTrackByContainment,
  assignZonesToPoint,
  classifyPointTerrain,
  classifyTrackTerrain,
  isPointInAnyGeometry,
  nearestMunicipality,
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

  it("attributes an offshore point to the nearest municipality within municipal waters (~15 km)", () => {
    // ~11 km west of Calapan's land edge (lon 121.10) at lat 13.40 — open water
    // inside the 15 km municipal-waters reach.
    const result = assignMunicipalityToPoint({ lat: 13.4, lon: 121.0 }, [
      calapanMuni,
    ]);
    expect(result).toBe("muni-calapan");
  });

  it("returns null for a point beyond municipal waters (>15 km offshore)", () => {
    // ~22 km west of Calapan's land edge — outside the 15 km reach.
    const result = assignMunicipalityToPoint({ lat: 13.4, lon: 120.9 }, [
      calapanMuni,
    ]);
    expect(result).toBeNull();
  });

  it("attributes a point inside an uploaded waterGeojson polygon to that municipality, even outside the land polygon and outside the generic 15 km buffer", () => {
    // Water polygon far offshore (west of Calapan's land edge, lon 121.10),
    // well beyond the 15 km municipal-waters buffer used by the fallback stage.
    const calapanWithWater: MunicipalityForAssignment = {
      ...calapanMuni,
      waterGeojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { shapeName: "Calapan Water" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [120.50, 13.25],
                  [120.90, 13.25],
                  [120.90, 13.55],
                  [120.50, 13.55],
                  [120.50, 13.25],
                ],
              ],
            },
          },
        ],
      },
    };
    // ~44 km offshore of Calapan's land edge — outside the 15 km reach, but
    // inside the uploaded water polygon above.
    const result = assignMunicipalityToPoint({ lat: 13.4, lon: 120.7 }, [calapanWithWater]);
    expect(result).toBe("muni-calapan");
  });

  it("falls back to the 15 km-buffer nearest stage when the point is outside the uploaded waterGeojson polygon", () => {
    const calapanWithWater: MunicipalityForAssignment = {
      ...calapanMuni,
      waterGeojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { shapeName: "Calapan Water" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [120.50, 13.25],
                  [120.90, 13.25],
                  [120.90, 13.55],
                  [120.50, 13.55],
                  [120.50, 13.25],
                ],
              ],
            },
          },
        ],
      },
    };
    // ~11 km offshore of Calapan's land edge, inside the 15 km buffer, but
    // outside the uploaded water polygon (which starts at lon 120.90) — so
    // this must still fall through to the nearest-within-15km stage.
    const result = assignMunicipalityToPoint({ lat: 13.4, lon: 121.0 }, [calapanWithWater]);
    expect(result).toBe("muni-calapan");
  });

  it("skips municipalities with no uploaded waterGeojson at the water-containment stage (falls through to nearest/null)", () => {
    // calapanMuni has no waterGeojson — a point beyond the 15 km buffer must
    // still return null, proving the water stage doesn't false-positive when
    // waterGeojson is absent.
    const result = assignMunicipalityToPoint({ lat: 13.4, lon: 120.9 }, [calapanMuni]);
    expect(result).toBeNull();
  });

  it("attributes an offshore point to the NEAREST municipality, not the first listed", () => {
    const southMuni: MunicipalityForAssignment = {
      id: "muni-south",
      slug: "south",
      name: "South",
      boundaryGeojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { shapeName: "South" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [121.1, 12.5],
                  [121.3, 12.5],
                  [121.3, 12.8],
                  [121.1, 12.8],
                  [121.1, 12.5],
                ],
              ],
            },
          },
        ],
      },
    };
    // Point ~11 km south of South's edge (12.80) but ~39 km from Calapan's
    // edge (13.25) — nearest is South even though Calapan is listed first.
    const result = assignMunicipalityToPoint({ lat: 12.9, lon: 121.2 }, [
      calapanMuni,
      southMuni,
    ]);
    expect(result).toBe("muni-south");
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

describe("assignMunicipalityToDominantTrack", () => {
  // A second, non-overlapping municipality far enough from Calapan City that
  // its "municipal waters" reach doesn't bleed into Calapan's — used to prove
  // dominant-track wins over a simple start-point assignment.
  const southMuni: MunicipalityForAssignment = {
    id: "muni-south",
    slug: "south",
    name: "South",
    boundaryGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { shapeName: "South" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [121.60, 13.25],
                [121.80, 13.25],
                [121.80, 13.55],
                [121.60, 13.55],
                [121.60, 13.25],
              ],
            ],
          },
        },
      ],
    },
  };

  it("returns the DOMINANT municipality even when the start/first point is in a different one", () => {
    // First point inside Calapan City, remaining 3 points inside South.
    const track = {
      type: "LineString",
      coordinates: [
        [121.1948, 13.3818], // Calapan City (start)
        [121.70, 13.35], // South
        [121.71, 13.36], // South
        [121.72, 13.37], // South
      ],
    };
    const result = assignMunicipalityToDominantTrack(track, [calapanMuni, southMuni]);
    expect(result).toBe("muni-south");
  });

  it("falls back to the fallbackPoint's municipality when the track is empty", () => {
    const emptyTrack = { type: "LineString", coordinates: [] };
    const result = assignMunicipalityToDominantTrack(
      emptyTrack,
      [calapanMuni, southMuni],
      { lat: 13.3818, lon: 121.1948 },
    );
    expect(result).toBe("muni-calapan");
  });

  it("falls back to the fallbackPoint's municipality when trackGeojson is null", () => {
    const result = assignMunicipalityToDominantTrack(
      null,
      [calapanMuni, southMuni],
      { lat: 13.3818, lon: 121.1948 },
    );
    expect(result).toBe("muni-calapan");
  });

  it("returns null when the track is empty and no fallbackPoint is given", () => {
    const emptyTrack = { type: "LineString", coordinates: [] };
    const result = assignMunicipalityToDominantTrack(emptyTrack, [calapanMuni, southMuni]);
    expect(result).toBeNull();
  });

  it("falls back to the fallbackPoint's municipality when every track point is outside all municipalities", () => {
    // Deep open ocean, far from both Calapan City and South.
    const track = {
      type: "LineString",
      coordinates: [
        [118.0, 14.0],
        [118.1, 14.1],
      ],
    };
    const result = assignMunicipalityToDominantTrack(
      track,
      [calapanMuni, southMuni],
      { lat: 13.3818, lon: 121.1948 },
    );
    expect(result).toBe("muni-calapan");
  });

  it("falls back to the NEAREST municipality (via the track's first point) when every track point is outside all municipalities and no fallbackPoint is given", () => {
    // Deep open ocean, no fallbackPoint — the offshore-attribution rule means
    // this must NOT be null: it falls back to the nearest municipality using
    // the track's own first point as the representative point. Calapan's
    // fixture (lon 121.10-121.30) is closer to (118.0, 14.0) than South's
    // (lon 121.60-121.80).
    const track = {
      type: "LineString",
      coordinates: [
        [118.0, 14.0],
        [118.1, 14.1],
      ],
    };
    const result = assignMunicipalityToDominantTrack(track, [calapanMuni, southMuni]);
    expect(result).toBe("muni-calapan");
  });

  it("supports MultiLineString tracks by flattening all segments", () => {
    const track = {
      type: "MultiLineString",
      coordinates: [
        [[121.1948, 13.3818]], // Calapan (1 point)
        [
          [121.70, 13.35],
          [121.71, 13.36],
        ], // South (2 points)
      ],
    };
    const result = assignMunicipalityToDominantTrack(track, [calapanMuni, southMuni]);
    expect(result).toBe("muni-south");
  });

  it("tie-break: when tallies are equal, the municipality whose first hit occurs earliest along the track wins", () => {
    // 1 hit each — Calapan's point comes first in the track order.
    const track = {
      type: "LineString",
      coordinates: [
        [121.1948, 13.3818], // Calapan (first)
        [121.70, 13.35], // South
      ],
    };
    const result = assignMunicipalityToDominantTrack(track, [calapanMuni, southMuni]);
    expect(result).toBe("muni-calapan");
  });
});

describe("nearestMunicipality", () => {
  const southMuni: MunicipalityForAssignment = {
    id: "muni-south",
    slug: "south",
    name: "South",
    boundaryGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { shapeName: "South" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [121.1, 12.5],
                [121.3, 12.5],
                [121.3, 12.8],
                [121.1, 12.8],
                [121.1, 12.5],
              ],
            ],
          },
        },
      ],
    },
  };

  it("returns the id of the polygon clearly nearest to the point, with NO distance cap", () => {
    // ~22 km west of Calapan's land edge — well beyond the 15 km municipal-waters
    // reach used by assignMunicipalityToPoint, but nearestMunicipality has no cap.
    const result = nearestMunicipality({ lat: 13.4, lon: 120.9 }, [calapanMuni]);
    expect(result).toBe("muni-calapan");
  });

  it("returns the containing municipality (distance 0) when the point is inside a polygon", () => {
    const result = nearestMunicipality({ lat: 13.3818, lon: 121.1948 }, [calapanMuni]);
    expect(result).toBe("muni-calapan");
  });

  it("returns the NEAREST of multiple municipalities, not the first listed", () => {
    // Same fixture/point pairing as the assignMunicipalityToPoint "nearest, not
    // first listed" test — South is nearer than Calapan even though Calapan is
    // listed first.
    const result = nearestMunicipality({ lat: 12.9, lon: 121.2 }, [calapanMuni, southMuni]);
    expect(result).toBe("muni-south");
  });

  it("returns null when the municipality list is empty", () => {
    const result = nearestMunicipality({ lat: 13.3818, lon: 121.1948 }, []);
    expect(result).toBeNull();
  });
});

describe("assignMunicipalityToPointOrNearest", () => {
  it("returns the containment id when the point is inside a municipality", () => {
    const result = assignMunicipalityToPointOrNearest(
      { lat: 13.3818, lon: 121.1948 },
      [calapanMuni],
    );
    expect(result).toBe("muni-calapan");
  });

  it("returns the nearest municipality id, uncapped, for a point outside every municipality", () => {
    // ~22 km offshore — beyond assignMunicipalityToPoint's 15 km reach (would be
    // null there), but assignMunicipalityToPointOrNearest always attributes it.
    const result = assignMunicipalityToPointOrNearest({ lat: 13.4, lon: 120.9 }, [calapanMuni]);
    expect(result).toBe("muni-calapan");
  });

  it("returns null when the municipality list is empty", () => {
    const result = assignMunicipalityToPointOrNearest({ lat: 13.3818, lon: 121.1948 }, []);
    expect(result).toBeNull();
  });

  it("attributes a point inside an uploaded waterGeojson polygon to that municipality before falling back to nearest", () => {
    const calapanWithWater: MunicipalityForAssignment = {
      ...calapanMuni,
      waterGeojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { shapeName: "Calapan Water" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [120.50, 13.25],
                  [120.90, 13.25],
                  [120.90, 13.55],
                  [120.50, 13.55],
                  [120.50, 13.25],
                ],
              ],
            },
          },
        ],
      },
    };
    const result = assignMunicipalityToPointOrNearest({ lat: 13.4, lon: 120.7 }, [
      calapanWithWater,
    ]);
    expect(result).toBe("muni-calapan");
  });
});

// ── isPointInAnyGeometry (report-map cross-municipality-leak fix, 2026-07-06) ─

describe("isPointInAnyGeometry", () => {
  // Local fixture (this file scopes "South" per-describe-block, not at module
  // level) — a second polygon disjoint from calapanMuni, bounded lat 12.5–12.8
  // / lon 121.1–121.3.
  const southGeojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { shapeName: "South" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [121.1, 12.5],
              [121.3, 12.5],
              [121.3, 12.8],
              [121.1, 12.8],
              [121.1, 12.5],
            ],
          ],
        },
      },
    ],
  };

  it("returns true when the point is inside the (only) supplied geometry", () => {
    expect(
      isPointInAnyGeometry({ lat: 13.3818, lon: 121.1948 }, [calapanMuni.boundaryGeojson]),
    ).toBe(true);
  });

  it("returns false when the point is outside every supplied geometry — no nearest fallback", () => {
    // ~22 km offshore — assignMunicipalityToPointOrNearest would still attribute
    // this to Calapan (nearest-fallback), but isPointInAnyGeometry is a STRICT
    // containment test with no fallback: this is the exact behavior the
    // cross-municipality-leak fix depends on.
    expect(isPointInAnyGeometry({ lat: 13.4, lon: 120.9 }, [calapanMuni.boundaryGeojson])).toBe(
      false,
    );
  });

  it("returns true when the point is inside the SECOND of multiple geometries (boundary ∪ water)", () => {
    expect(
      isPointInAnyGeometry({ lat: 12.65, lon: 121.2 }, [calapanMuni.boundaryGeojson, southGeojson]),
    ).toBe(true);
  });

  it("ignores null/undefined entries mixed with a valid geometry", () => {
    expect(
      isPointInAnyGeometry({ lat: 13.3818, lon: 121.1948 }, [
        null,
        calapanMuni.boundaryGeojson,
        undefined,
      ]),
    ).toBe(true);
  });

  it("returns false for an empty geometries array", () => {
    expect(isPointInAnyGeometry({ lat: 13.3818, lon: 121.1948 }, [])).toBe(false);
  });
});

describe("classifyPointTerrain", () => {
  const calapanWithWater: MunicipalityForAssignment = {
    ...calapanMuni,
    waterGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { shapeName: "Calapan Water" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [120.50, 13.25],
                [120.90, 13.25],
                [120.90, 13.55],
                [120.50, 13.55],
                [120.50, 13.25],
              ],
            ],
          },
        },
      ],
    },
  };

  it("returns 'land' for a point inside a municipality's land polygon", () => {
    const result = classifyPointTerrain({ lat: 13.3818, lon: 121.1948 }, [calapanMuni]);
    expect(result).toBe("land");
  });

  it("returns 'water' for a point outside land but inside an uploaded waterGeojson polygon", () => {
    // ~44 km offshore of Calapan's land edge — outside the 15 km reach, but
    // inside the uploaded water polygon.
    const result = classifyPointTerrain({ lat: 13.4, lon: 120.7 }, [calapanWithWater]);
    expect(result).toBe("water");
  });

  it("returns 'water' for a point offshore within the 15 km municipal-waters buffer of land", () => {
    // ~11 km offshore of Calapan's land edge — inside the 15 km buffer, no
    // uploaded water polygon covers it (plain calapanMuni, no waterGeojson).
    const result = classifyPointTerrain({ lat: 13.4, lon: 121.05 }, [calapanMuni]);
    expect(result).toBe("water");
  });

  it("returns null for a point far from every municipality (open ocean)", () => {
    const result = classifyPointTerrain({ lat: 14.0, lon: 118.0 }, [calapanMuni]);
    expect(result).toBeNull();
  });

  it("returns null when municipality list is empty", () => {
    const result = classifyPointTerrain({ lat: 13.3818, lon: 121.1948 }, []);
    expect(result).toBeNull();
  });
});

describe("classifyTrackTerrain", () => {
  // Builds a raw GeoJSON LineString from { lat, lon } points — the same
  // [lon, lat] coordinate order `PatrolTrack.trackGeojson` stores and that
  // the shared `extractTrackCoordinates` internal helper expects.
  const lineStringFrom = (points: Array<{ lat: number; lon: number }>) => ({
    type: "LineString",
    coordinates: points.map((p) => [p.lon, p.lat]),
  });

  it("returns 'land' for a track whose majority of points are on land", () => {
    const track = lineStringFrom([
      { lat: 13.3818, lon: 121.1948 }, // land
      { lat: 13.39, lon: 121.20 }, // land
      { lat: 13.40, lon: 121.21 }, // land
      { lat: 14.0, lon: 118.0 }, // unclassifiable (ignored)
    ]);
    const result = classifyTrackTerrain(track, [calapanMuni]);
    expect(result).toBe("land");
  });

  it("returns 'water' for a track whose majority of points are offshore", () => {
    const track = lineStringFrom([
      { lat: 13.3818, lon: 121.1948 }, // land
      { lat: 13.4, lon: 121.05 }, // water (within 15km buffer, no land polygon match)
      { lat: 13.4, lon: 121.06 }, // water
      { lat: 13.4, lon: 121.07 }, // water
    ]);
    const result = classifyTrackTerrain(track, [calapanMuni]);
    expect(result).toBe("water");
  });

  it("breaks a land/water tie in favor of 'water'", () => {
    const track = lineStringFrom([
      { lat: 13.3818, lon: 121.1948 }, // land
      { lat: 13.4, lon: 121.05 }, // water
    ]);
    const result = classifyTrackTerrain(track, [calapanMuni]);
    expect(result).toBe("water");
  });

  it("returns null when no track point classifies (all unclassifiable, empty track, or unparseable geojson)", () => {
    expect(classifyTrackTerrain(lineStringFrom([]), [calapanMuni])).toBeNull();
    expect(
      classifyTrackTerrain(
        lineStringFrom([
          { lat: 14.0, lon: 118.0 },
          { lat: 14.1, lon: 118.1 },
        ]),
        [calapanMuni],
      ),
    ).toBeNull();
    expect(classifyTrackTerrain(null, [calapanMuni])).toBeNull();
    expect(classifyTrackTerrain({ type: "Unsupported" }, [calapanMuni])).toBeNull();
  });
});

describe("extractTrackCoordinates — FeatureCollection track format (real PatrolTrack.trackGeojson shape)", () => {
  // PatrolTrack.trackGeojson is stored as a FeatureCollection of one or more
  // LineString Features — NOT a bare LineString. These tests prove the
  // internal `extractTrackCoordinates` helper (shared by both
  // `classifyTrackTerrain` and `assignMunicipalityToDominantTrack`) handles
  // this real shape, including multiple features in one FeatureCollection.

  const featureCollectionFromLineStrings = (
    lineStrings: Array<Array<[number, number]>>,
  ) => ({
    type: "FeatureCollection",
    features: lineStrings.map((coordinates) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    })),
  });

  // Second municipality (mirrors the one used in the
  // `assignMunicipalityToDominantTrack` describe block above) — far enough
  // from Calapan City that the two never overlap.
  const southMuni: MunicipalityForAssignment = {
    id: "muni-south",
    slug: "south",
    name: "South",
    boundaryGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { shapeName: "South" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [121.60, 13.25],
                [121.80, 13.25],
                [121.80, 13.55],
                [121.60, 13.55],
                [121.60, 13.25],
              ],
            ],
          },
        },
      ],
    },
  };

  it("classifyTrackTerrain: FeatureCollection with a single LineString feature on land returns 'land'", () => {
    const track = featureCollectionFromLineStrings([
      [
        [121.1948, 13.3818], // land
        [121.20, 13.39], // land
        [121.21, 13.40], // land
      ],
    ]);
    expect(classifyTrackTerrain(track, [calapanMuni])).toBe("land");
  });

  it("classifyTrackTerrain: FeatureCollection with a single LineString feature offshore returns 'water'", () => {
    const track = featureCollectionFromLineStrings([
      [
        [121.05, 13.4], // water (within 15km buffer, no land polygon match)
        [121.06, 13.4], // water
        [121.07, 13.4], // water
      ],
    ]);
    expect(classifyTrackTerrain(track, [calapanMuni])).toBe("water");
  });

  it("classifyTrackTerrain: coordinates from ALL features in a multi-feature FeatureCollection are considered", () => {
    // Feature 1 = 1 land point, Feature 2 = 2 water points → majority water.
    // If only the first feature were read (the pre-fix behaviour), the
    // result would incorrectly ignore feature 2 entirely.
    const track = featureCollectionFromLineStrings([
      [[121.1948, 13.3818]], // land
      [
        [121.05, 13.4], // water
        [121.06, 13.4], // water
      ],
    ]);
    expect(classifyTrackTerrain(track, [calapanMuni])).toBe("water");
  });

  it("assignMunicipalityToDominantTrack: FeatureCollection format returns the dominant municipality across all features", () => {
    // Feature 1 = 1 point in Calapan, Feature 2 = 2 points in South.
    const track = featureCollectionFromLineStrings([
      [[121.1948, 13.3818]], // Calapan
      [
        [121.70, 13.35], // South
        [121.71, 13.36], // South
      ],
    ]);
    const result = assignMunicipalityToDominantTrack(track, [calapanMuni, southMuni]);
    expect(result).toBe("muni-south");
  });

  it("returns null/empty for an empty, no-features, or malformed FeatureCollection", () => {
    expect(classifyTrackTerrain({ type: "FeatureCollection", features: [] }, [calapanMuni])).toBeNull();
    expect(
      assignMunicipalityToDominantTrack(
        { type: "FeatureCollection", features: [] },
        [calapanMuni, southMuni],
      ),
    ).toBeNull();
    expect(classifyTrackTerrain({ type: "FeatureCollection" }, [calapanMuni])).toBeNull();
    expect(classifyTrackTerrain({ type: "FeatureCollection", features: [null] }, [calapanMuni])).toBeNull();
  });
});

// ── Equidistance (median-line) tie-break for OVERLAPPING water polygons ────────
// PH municipal-waters law (RA 7160 §131 / RA 8550 IRR / NAMRIA): where two
// adjacent municipalities' waters overlap, the boundary is the median line —
// a water point belongs to the municipality whose COASTLINE is nearest. The
// derived 15 km water buffers overlap heavily, so `containingWaterMunicipality`
// MUST resolve the overlap by nearest coast, NOT by array/DB order.
describe("water-polygon overlap resolves by nearest coastline (equidistance)", () => {
  // West muni: land lon 121.00–121.10 (east coast at 121.10); water 121.00–121.25.
  const westMuni: MunicipalityForAssignment = {
    id: "muni-west",
    slug: "west",
    name: "West",
    boundaryGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[121.0, 13.35], [121.1, 13.35], [121.1, 13.45], [121.0, 13.45], [121.0, 13.35]]],
          },
        },
      ],
    },
    waterGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[121.0, 13.3], [121.25, 13.3], [121.25, 13.5], [121.0, 13.5], [121.0, 13.3]]],
          },
        },
      ],
    },
  };
  // East muni: land lon 121.20–121.30 (west coast at 121.20); water 121.05–121.30.
  const eastMuni: MunicipalityForAssignment = {
    id: "muni-east",
    slug: "east",
    name: "East",
    boundaryGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[121.2, 13.35], [121.3, 13.35], [121.3, 13.45], [121.2, 13.45], [121.2, 13.35]]],
          },
        },
      ],
    },
    waterGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[121.05, 13.3], [121.3, 13.3], [121.3, 13.5], [121.05, 13.5], [121.05, 13.3]]],
          },
        },
      ],
    },
  };

  // Point in the shared water gap (between the two lands), nearer EAST's coast.
  const nearEast = { lat: 13.4, lon: 121.18 }; // 0.02 from east coast, 0.08 from west
  // Point in the shared water gap, nearer WEST's coast.
  const nearWest = { lat: 13.4, lon: 121.12 }; // 0.02 from west coast, 0.08 from east

  it("assigns an overlap point to the nearer coast regardless of array order (assignMunicipalityToPoint)", () => {
    expect(assignMunicipalityToPoint(nearEast, [westMuni, eastMuni])).toBe("muni-east");
    expect(assignMunicipalityToPoint(nearEast, [eastMuni, westMuni])).toBe("muni-east");
    expect(assignMunicipalityToPoint(nearWest, [westMuni, eastMuni])).toBe("muni-west");
    expect(assignMunicipalityToPoint(nearWest, [eastMuni, westMuni])).toBe("muni-west");
  });

  it("assigns an overlap point to the nearer coast regardless of array order (assignMunicipalityToPointOrNearest)", () => {
    expect(assignMunicipalityToPointOrNearest(nearEast, [westMuni, eastMuni])).toBe("muni-east");
    expect(assignMunicipalityToPointOrNearest(nearEast, [eastMuni, westMuni])).toBe("muni-east");
    expect(assignMunicipalityToPointOrNearest(nearWest, [westMuni, eastMuni])).toBe("muni-west");
    expect(assignMunicipalityToPointOrNearest(nearWest, [eastMuni, westMuni])).toBe("muni-west");
  });
});

// ── Governing principle: boundaries-only attribution (owner 2026-07-13) ──────
// Attribution follows ONLY the boundaries we hold (pure point-in-polygon
// containment). A coordinate outside every land AND water polygon is
// UNATTRIBUTED — never snapped to the nearest municipality.

// Calapan land (lon 121.10–121.30) + an adjacent water box just west of it
// (lon 120.90–121.10). A point west of 120.90 is outside BOTH.
const calapanLandAndWater: MunicipalityForAssignment = {
  id: "muni-calapan",
  slug: "calapan-city",
  name: "Calapan City",
  boundaryGeojson: CALAPAN_GEOJSON,
  waterGeojson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [120.9, 13.25],
              [121.1, 13.25],
              [121.1, 13.55],
              [120.9, 13.55],
              [120.9, 13.25],
            ],
          ],
        },
      },
    ],
  },
};

describe("assignMunicipalityByContainment", () => {
  const insideLand = { lat: 13.4, lon: 121.2 }; // inside land rectangle
  const insideWaterOnly = { lat: 13.4, lon: 121.0 }; // outside land, inside water box
  const offshore = { lat: 13.4, lon: 120.5 }; // west of water box — outside BOTH

  it("attributes a point inside the land polygon", () => {
    expect(assignMunicipalityByContainment(insideLand, [calapanLandAndWater])).toBe("muni-calapan");
  });

  it("attributes a point inside the water polygon (the boundaries we hold)", () => {
    expect(assignMunicipalityByContainment(insideWaterOnly, [calapanLandAndWater])).toBe("muni-calapan");
  });

  it("returns null for a point outside every land AND water boundary", () => {
    expect(assignMunicipalityByContainment(offshore, [calapanLandAndWater])).toBeNull();
  });

  it("returns null for the open ocean far from any boundary", () => {
    expect(assignMunicipalityByContainment({ lat: 14.0, lon: 118.0 }, [calapanLandAndWater])).toBeNull();
  });

  it("returns null when the municipality list is empty", () => {
    expect(assignMunicipalityByContainment(insideLand, [])).toBeNull();
  });

  it("GOVERNING PRINCIPLE: an out-of-bounds point is UNATTRIBUTED, unlike the deprecated nearest snap", () => {
    // Same offshore point: containment = null; the old uncapped-nearest assigner
    // would fabricate an attribution to the nearest coastal municipality.
    expect(assignMunicipalityByContainment(offshore, [calapanLandAndWater])).toBeNull();
    expect(assignMunicipalityToPointOrNearest(offshore, [calapanLandAndWater])).toBe("muni-calapan");
  });
});

describe("assignMunicipalityToDominantTrackByContainment", () => {
  const trackInLand = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [121.15, 13.3],
            [121.2, 13.4],
            [121.25, 13.45],
          ],
        },
      },
    ],
  };
  const trackOffshore = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [120.5, 13.3],
            [120.4, 13.4],
            [120.3, 13.45],
          ],
        },
      },
    ],
  };
  const trackMostlyLand = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [121.2, 13.4], // land
            [121.22, 13.41], // land
            [120.5, 13.3], // offshore — ignored (not contained)
          ],
        },
      },
    ],
  };

  it("attributes a track that lies inside a municipality", () => {
    expect(assignMunicipalityToDominantTrackByContainment(trackInLand, [calapanLandAndWater])).toBe("muni-calapan");
  });

  it("takes the DOMINANT contained municipality, ignoring out-of-bounds points", () => {
    expect(assignMunicipalityToDominantTrackByContainment(trackMostlyLand, [calapanLandAndWater])).toBe("muni-calapan");
  });

  it("GOVERNING PRINCIPLE: a wholly-offshore track is UNATTRIBUTED (no nearest fallback)", () => {
    expect(assignMunicipalityToDominantTrackByContainment(trackOffshore, [calapanLandAndWater])).toBeNull();
    // Contrast: the deprecated dominant-track assigner snaps it to the nearest LGU.
    expect(assignMunicipalityToDominantTrack(trackOffshore, [calapanLandAndWater])).toBe("muni-calapan");
  });

  it("returns null for an empty / unparseable track", () => {
    expect(
      assignMunicipalityToDominantTrackByContainment(
        { type: "FeatureCollection", features: [] },
        [calapanLandAndWater],
      ),
    ).toBeNull();
  });
});
