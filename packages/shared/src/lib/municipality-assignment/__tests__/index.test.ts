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
  firstTrackPoint,
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

  it("returns 'land' for a track whose majority of points are on land", async () => {
    const track = lineStringFrom([
      { lat: 13.3818, lon: 121.1948 }, // land
      { lat: 13.39, lon: 121.20 }, // land
      { lat: 13.40, lon: 121.21 }, // land
      { lat: 14.0, lon: 118.0 }, // unclassifiable (ignored)
    ]);
    const result = await classifyTrackTerrain(track, [calapanMuni]);
    expect(result).toBe("land");
  });

  it("returns 'water' for a track whose majority of points are offshore", async () => {
    const track = lineStringFrom([
      { lat: 13.3818, lon: 121.1948 }, // land
      { lat: 13.4, lon: 121.05 }, // water (within 15km buffer, no land polygon match)
      { lat: 13.4, lon: 121.06 }, // water
      { lat: 13.4, lon: 121.07 }, // water
    ]);
    const result = await classifyTrackTerrain(track, [calapanMuni]);
    expect(result).toBe("water");
  });

  it("breaks a land/water tie in favor of 'water'", async () => {
    const track = lineStringFrom([
      { lat: 13.3818, lon: 121.1948 }, // land
      { lat: 13.4, lon: 121.05 }, // water
    ]);
    const result = await classifyTrackTerrain(track, [calapanMuni]);
    expect(result).toBe("water");
  });

  it("returns null when no track point classifies (all unclassifiable, empty track, or unparseable geojson)", async () => {
    expect(await classifyTrackTerrain(lineStringFrom([]), [calapanMuni])).toBeNull();
    expect(
      await classifyTrackTerrain(
        lineStringFrom([
          { lat: 14.0, lon: 118.0 },
          { lat: 14.1, lon: 118.1 },
        ]),
        [calapanMuni],
      ),
    ).toBeNull();
    expect(await classifyTrackTerrain(null, [calapanMuni])).toBeNull();
    expect(await classifyTrackTerrain({ type: "Unsupported" }, [calapanMuni])).toBeNull();
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

  it("classifyTrackTerrain: FeatureCollection with a single LineString feature on land returns 'land'", async () => {
    const track = featureCollectionFromLineStrings([
      [
        [121.1948, 13.3818], // land
        [121.20, 13.39], // land
        [121.21, 13.40], // land
      ],
    ]);
    expect(await classifyTrackTerrain(track, [calapanMuni])).toBe("land");
  });

  it("classifyTrackTerrain: FeatureCollection with a single LineString feature offshore returns 'water'", async () => {
    const track = featureCollectionFromLineStrings([
      [
        [121.05, 13.4], // water (within 15km buffer, no land polygon match)
        [121.06, 13.4], // water
        [121.07, 13.4], // water
      ],
    ]);
    expect(await classifyTrackTerrain(track, [calapanMuni])).toBe("water");
  });

  it("classifyTrackTerrain: coordinates from ALL features in a multi-feature FeatureCollection are considered", async () => {
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
    expect(await classifyTrackTerrain(track, [calapanMuni])).toBe("water");
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

  it("returns null/empty for an empty, no-features, or malformed FeatureCollection", async () => {
    expect(await classifyTrackTerrain({ type: "FeatureCollection", features: [] }, [calapanMuni])).toBeNull();
    expect(
      assignMunicipalityToDominantTrack(
        { type: "FeatureCollection", features: [] },
        [calapanMuni, southMuni],
      ),
    ).toBeNull();
    expect(await classifyTrackTerrain({ type: "FeatureCollection" }, [calapanMuni])).toBeNull();
    expect(await classifyTrackTerrain({ type: "FeatureCollection", features: [null] }, [calapanMuni])).toBeNull();
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

describe("firstTrackPoint", () => {
  it("returns the first coordinate of a valid LineString FeatureCollection track as { lat, lon }", () => {
    const track = {
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
    expect(firstTrackPoint(track)).toEqual({ lat: 13.3, lon: 121.15 });
  });

  it("returns null for an empty FeatureCollection", () => {
    expect(firstTrackPoint({ type: "FeatureCollection", features: [] })).toBeNull();
  });

  it("returns null for malformed/invalid geojson", () => {
    expect(firstTrackPoint(null)).toBeNull();
    expect(firstTrackPoint({ type: "FeatureCollection" })).toBeNull();
    expect(firstTrackPoint({ type: "FeatureCollection", features: [null] })).toBeNull();
  });
});

// ── Performance optimizations (O1 bbox pre-filter / O3 existence-only water
// test / O4 early-exit / O5 memoized unwrap / O6 exact-coordinate dedup) —
// output-equivalence tests. None of these change attribution semantics; each
// test below proves a specific optimization didn't leak an approximation
// into a real result.

describe("O1 — bbox pre-filter is an exact short-circuit (on-boundary points still classify)", () => {
  it("classifies a point exactly ON the bbox's minLon edge as inside (inclusive comparison)", () => {
    // Calapan fixture's land rectangle starts at lon 121.10 exactly — this
    // point sits ON that edge, proving the bbox test's `>=`/`<=` (not `>`/`<`)
    // never wrongly treats an edge point as outside the bbox pre-filter.
    const result = assignMunicipalityToPoint({ lat: 13.3818, lon: 121.10 }, [calapanMuni]);
    expect(result).toBe("muni-calapan");
  });

  it("classifies a point exactly ON the bbox's maxLat edge as inside (inclusive comparison)", () => {
    const result = assignMunicipalityToPoint({ lat: 13.55, lon: 121.2 }, [calapanMuni]);
    expect(result).toBe("muni-calapan");
  });

  it("classifies a point exactly on ALL FOUR corners of the bbox rectangle as inside", () => {
    const corners: Array<{ lat: number; lon: number }> = [
      { lat: 13.25, lon: 121.10 },
      { lat: 13.25, lon: 121.30 },
      { lat: 13.55, lon: 121.10 },
      { lat: 13.55, lon: 121.30 },
    ];
    for (const corner of corners) {
      expect(assignMunicipalityToPoint(corner, [calapanMuni])).toBe("muni-calapan");
    }
  });

  it("isPointInAnyGeometry: still returns true for a point exactly on the bbox edge", () => {
    expect(
      isPointInAnyGeometry({ lat: 13.3818, lon: 121.10 }, [calapanMuni.boundaryGeojson]),
    ).toBe(true);
  });

  it("assignZonesToPoint: still returns the zone id for a point exactly on the zone bbox edge", () => {
    expect(assignZonesToPoint({ lat: 12.6714, lon: 120.40 }, [apoZone])).toContain(
      "zone-apo-reef",
    );
  });
});

describe("O1 — bbox pre-filter handles MultiPolygon geometry (bare and FeatureCollection-wrapped)", () => {
  // Two disjoint squares as ONE MultiPolygon boundary — real municipality
  // boundaries are frequently stored as MultiPolygon (island groups etc.), so
  // the bbox extractor must span both parts, not just the first.
  const multiPolyMuni: MunicipalityForAssignment = {
    id: "muni-multi",
    slug: "multi",
    name: "Multi",
    boundaryGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [121.10, 13.25],
                  [121.20, 13.25],
                  [121.20, 13.35],
                  [121.10, 13.35],
                  [121.10, 13.25],
                ],
              ],
              // Second, disjoint part far to the east — the bbox must extend
              // to cover it too, or this part's own points would be wrongly
              // bbox-pre-filtered out.
              [
                [
                  [121.70, 13.45],
                  [121.80, 13.45],
                  [121.80, 13.55],
                  [121.70, 13.55],
                  [121.70, 13.45],
                ],
              ],
            ],
          },
        },
      ],
    },
  };

  it("contains a point inside the FIRST polygon part", () => {
    expect(assignMunicipalityToPoint({ lat: 13.30, lon: 121.15 }, [multiPolyMuni])).toBe(
      "muni-multi",
    );
  });

  it("contains a point inside the SECOND, disjoint polygon part (proves the bbox spans both parts)", () => {
    expect(assignMunicipalityToPoint({ lat: 13.50, lon: 121.75 }, [multiPolyMuni])).toBe(
      "muni-multi",
    );
  });

  it("still returns null for a point between the two parts, outside both (and outside 15km buffer)", () => {
    expect(assignMunicipalityToPoint({ lat: 13.40, lon: 121.45 }, [multiPolyMuni])).toBeNull();
  });

  it("bare (unwrapped) MultiPolygon geometry — isPointInAnyGeometry still handles it via bbox + PIP", () => {
    const bareMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [121.10, 13.25],
            [121.20, 13.25],
            [121.20, 13.35],
            [121.10, 13.35],
            [121.10, 13.25],
          ],
        ],
      ],
    };
    expect(isPointInAnyGeometry({ lat: 13.30, lon: 121.15 }, [bareMultiPolygon])).toBe(true);
    expect(isPointInAnyGeometry({ lat: 14.0, lon: 118.0 }, [bareMultiPolygon])).toBe(false);
  });
});

describe("O1 — bbox pre-filter handles a bare Feature (not FeatureCollection-wrapped) geometry", () => {
  it("isPointInAnyGeometry: contains a point inside a bare Feature<Polygon>", () => {
    const bareFeature = {
      type: "Feature",
      properties: {},
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
    };
    expect(isPointInAnyGeometry({ lat: 13.3818, lon: 121.1948 }, [bareFeature])).toBe(true);
    expect(isPointInAnyGeometry({ lat: 14.0, lon: 118.0 }, [bareFeature])).toBe(false);
  });
});

describe("O3 — existence-only water test does not leak into attribution (equidistance tie-break still resolves the winner)", () => {
  // Same overlapping-water pattern as the module-level equidistance describe
  // block above, reconstructed locally so this suite is self-contained.
  const westMuni: MunicipalityForAssignment = {
    id: "muni-west-o3",
    slug: "west-o3",
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
  const eastMuni: MunicipalityForAssignment = {
    id: "muni-east-o3",
    slug: "east-o3",
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
  const nearEast = { lat: 13.4, lon: 121.18 }; // 0.02 from east coast, 0.08 from west
  const nearWest = { lat: 13.4, lon: 121.12 }; // 0.02 from west coast, 0.08 from east

  it("assignMunicipalityByContainment still resolves an overlap point to the NEARER coast, in either array order", () => {
    expect(assignMunicipalityByContainment(nearEast, [westMuni, eastMuni])).toBe("muni-east-o3");
    expect(assignMunicipalityByContainment(nearEast, [eastMuni, westMuni])).toBe("muni-east-o3");
    expect(assignMunicipalityByContainment(nearWest, [westMuni, eastMuni])).toBe("muni-west-o3");
    expect(assignMunicipalityByContainment(nearWest, [eastMuni, westMuni])).toBe("muni-west-o3");
  });

  it("classifyPointTerrain (which DOES use the existence-only O3 helper) still just returns 'water' for the same overlap points", () => {
    // classifyPointTerrain never needs to pick a winner — both points are
    // "water" regardless of which municipality's coast is nearer.
    expect(classifyPointTerrain(nearEast, [westMuni, eastMuni])).toBe("water");
    expect(classifyPointTerrain(nearWest, [westMuni, eastMuni])).toBe("water");
  });
});

describe("O6 — exact-coordinate dedup does not disturb the dominant-track first-hit tie-break", () => {
  const calapanContainment: MunicipalityForAssignment = {
    id: "muni-calapan",
    slug: "calapan-city",
    name: "Calapan City",
    boundaryGeojson: CALAPAN_GEOJSON,
  };
  const southContainment: MunicipalityForAssignment = {
    id: "muni-south",
    slug: "south",
    name: "South",
    boundaryGeojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
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
  const featureCollectionFromLineString = (coordinates: Array<[number, number]>) => ({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
    ],
  });

  it("tallies EVERY repeated exact-duplicate point occurrence (not just once per distinct coordinate) — a 2-vs-2 tie resolves by earliest first-hit index, Calapan first", () => {
    // Exact same [lon,lat] pair repeated back-to-back (a stationary vessel) —
    // the O6 cache must still count both Calapan occurrences AND both South
    // occurrences, producing a genuine 2-2 tie broken by first-hit order.
    const track = featureCollectionFromLineString([
      [121.1948, 13.3818], // Calapan (index 0)
      [121.1948, 13.3818], // Calapan again, EXACT duplicate (index 1)
      [121.70, 13.35], // South (index 2)
      [121.70, 13.35], // South again, EXACT duplicate (index 3)
    ]);
    const result = assignMunicipalityToDominantTrackByContainment(track, [
      calapanContainment,
      southContainment,
    ]);
    expect(result).toBe("muni-calapan");
  });

  it("same 2-2 tie, but SOUTH's exact-duplicate pair comes first along the track — South wins the tie-break", () => {
    const track = featureCollectionFromLineString([
      [121.70, 13.35], // South (index 0)
      [121.70, 13.35], // South again, EXACT duplicate (index 1)
      [121.1948, 13.3818], // Calapan (index 2)
      [121.1948, 13.3818], // Calapan again, EXACT duplicate (index 3)
    ]);
    const result = assignMunicipalityToDominantTrackByContainment(track, [
      calapanContainment,
      southContainment,
    ]);
    expect(result).toBe("muni-south");
  });

  it("a dedup'd majority still wins outright (not a tie) — 3 exact-duplicate Calapan points outweigh 1 South point", () => {
    const track = featureCollectionFromLineString([
      [121.70, 13.35], // South (1 hit)
      [121.1948, 13.3818], // Calapan
      [121.1948, 13.3818], // Calapan (exact duplicate)
      [121.1948, 13.3818], // Calapan (exact duplicate)
    ]);
    const result = assignMunicipalityToDominantTrackByContainment(track, [
      calapanContainment,
      southContainment,
    ]);
    expect(result).toBe("muni-calapan");
  });

  it("classifyTrackTerrain: exact-duplicate points still tally every occurrence toward the land/water majority vote", async () => {
    // 3 exact-duplicate "water" points vs 1 "land" point — majority is water
    // even though the water samples collapse to a single cached computation.
    const track = featureCollectionFromLineString([
      [121.1948, 13.3818], // land
      [121.05, 13.4], // water (within 15km buffer)
      [121.05, 13.4], // water, EXACT duplicate
      [121.05, 13.4], // water, EXACT duplicate
    ]);
    expect(await classifyTrackTerrain(track, [calapanContainment])).toBe("water");
  });
});
