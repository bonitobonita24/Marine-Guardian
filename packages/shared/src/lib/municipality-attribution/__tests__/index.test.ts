// @vitest-environment node
//
// Unit tests for municipality-attribution BACKFILL-ONLY pure functions.
// Uses inline GeoJSON fixtures (no disk reads → no @types/node dependency,
// tsconfig's "include": ["src/**/*.ts"] excludes test files so node builtins
// would fail the typecheck).

import { describe, it, expect } from "vitest";
import {
  matchTitleHint,
  nearestWithinCap,
  MIN_TITLE_LENGTH,
  NEAREST_CAP_KM,
  GARBAGE_COORD_KM,
} from "../index.js";
import type { MunicipalityForAssignment } from "../../municipality-assignment/types.js";

describe("matchTitleHint", () => {
  it("does NOT match 'st' as a substring inside 'Nestor'", () => {
    expect(matchTitleHint("Nestor patrol boat")).toBeNull();
  });

  it("does NOT match 'st' inside 'STATION'", () => {
    expect(matchTitleHint("STATION 3 checkpoint")).toBeNull();
  });

  it("does NOT match 'cal' inside 'Calacalsag'", () => {
    expect(matchTitleHint("Calacalsag river sweep")).toBeNull();
  });

  it("does NOT match any hint in a title containing 'Mamerto' (mam exclusion)", () => {
    expect(matchTitleHint("Mamerto foot patrol today")).toBeNull();
  });

  it("does NOT match 'pg' when digit-adjacent (PG01) — proves [^a-z0-9] boundary, not \\b", () => {
    expect(matchTitleHint("PG01 route")).toBeNull();
  });

  it("matches 'PG sto niño to scarsio point' → puerto-galera", () => {
    expect(matchTitleHint("PG sto niño to scarsio point")).toEqual({
      slug: "puerto-galera",
      hint: "pg",
    });
  });

  it("matches 'SABLAYAN APO REEF' → sablayan", () => {
    expect(matchTitleHint("SABLAYAN APO REEF")).toEqual({
      slug: "sablayan",
      hint: "sablayan",
    });
  });

  it("accepts 'Tacligan ST patrol' as ONE distinct municipality (san-teodoro)", () => {
    const result = matchTitleHint("Tacligan ST patrol");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("san-teodoro");
  });

  it("returns null when hints imply two DIFFERENT municipalities", () => {
    expect(matchTitleHint("PG to ADI transfer")).toBeNull();
  });

  it("returns null for sub-5-char title 'ST'", () => {
    expect(matchTitleHint("ST")).toBeNull();
  });

  it("returns null for sub-5-char title 'PG'", () => {
    expect(matchTitleHint("PG")).toBeNull();
  });

  it("returns null for 'Tèst only' (no whitelisted whole token)", () => {
    expect(matchTitleHint("Tèst only")).toBeNull();
  });

  it("matches 'Calintaan coastal run' as calintaan, NOT calapan-city (full word beats abbreviation)", () => {
    expect(matchTitleHint("Calintaan coastal run")).toEqual({
      slug: "calintaan",
      hint: "calintaan",
    });
  });

  it("returns null for null title", () => {
    expect(matchTitleHint(null)).toBeNull();
  });

  it("returns null for undefined title", () => {
    expect(matchTitleHint(undefined)).toBeNull();
  });

  it("returns null for empty title", () => {
    expect(matchTitleHint("")).toBeNull();
  });

  it("MIN_TITLE_LENGTH constant is 5", () => {
    expect(MIN_TITLE_LENGTH).toBe(5);
  });
});

describe("nearestWithinCap", () => {
  // Two small square polygons ~1 degree of latitude apart (~111km) so
  // distance assertions are unambiguous. 1 degree latitude ≈ 111 km.
  const MUNI_A: MunicipalityForAssignment = {
    id: "muni-a",
    slug: "muni-a",
    name: "Muni A",
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
                [121.0, 13.0],
                [121.01, 13.0],
                [121.01, 13.01],
                [121.0, 13.01],
                [121.0, 13.0],
              ],
            ],
          },
        },
      ],
    },
  };

  const MUNI_B: MunicipalityForAssignment = {
    id: "muni-b",
    slug: "muni-b",
    name: "Muni B",
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
                [121.0, 14.0],
                [121.01, 14.0],
                [121.01, 14.01],
                [121.0, 14.01],
                [121.0, 14.0],
              ],
            ],
          },
        },
      ],
    },
  };

  it("attributes a point at exactly the 45km cap boundary (inclusive)", () => {
    // 1 degree latitude ≈ 111.32 km at these latitudes. We want a point whose
    // distance to MUNI_A's boundary edge (lat 13.01) is as close to 45km as
    // possible. 45 / 111.32 ≈ 0.4042 degrees north of the boundary edge.
    const offsetDeg = 45 / 111.32;
    const point = { lat: 13.01 + offsetDeg, lon: 121.005 };
    const result = nearestWithinCap(point, [MUNI_A]);
    expect(result).not.toBeNull();
    expect(result?.municipalityId).toBe("muni-a");
    expect(result?.distanceKm).toBeCloseTo(45, 0);
  });

  it("returns null just beyond the 45km cap", () => {
    const offsetDeg = 50 / 111.32; // 50km — clearly beyond the 45km cap
    const point = { lat: 13.01 + offsetDeg, lon: 121.005 };
    const result = nearestWithinCap(point, [MUNI_A]);
    expect(result).toBeNull();
  });

  it("respects a custom capKm", () => {
    const offsetDeg = 5 / 111.32;
    const point = { lat: 13.01 + offsetDeg, lon: 121.005 };
    expect(nearestWithinCap(point, [MUNI_A], 3)).toBeNull();
    expect(nearestWithinCap(point, [MUNI_A], 10)).not.toBeNull();
  });

  it("sets ambiguous:true on a near-tie between two municipalities", () => {
    // A point roughly equidistant between MUNI_A (edge lat 13.01) and
    // MUNI_B (edge lat 14.0) would be ~55km each way — but that's beyond the
    // default cap. Use a raised cap and two polygons close together instead.
    const near: MunicipalityForAssignment = {
      id: "muni-near",
      slug: "muni-near",
      name: "Muni Near",
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
                  [121.02, 13.0],
                  [121.03, 13.0],
                  [121.03, 13.01],
                  [121.02, 13.01],
                  [121.02, 13.0],
                ],
              ],
            },
          },
        ],
      },
    };
    // Point just east of MUNI_A's edge (lon 121.01), roughly equidistant to
    // MUNI_A's east edge and `near`'s west edge (lon 121.02).
    const point = { lat: 13.005, lon: 121.015 };
    const result = nearestWithinCap(point, [MUNI_A, near], 50);
    expect(result).not.toBeNull();
    expect(result?.ambiguous).toBe(true);
  });

  it("sets ambiguous:false when there is a clear winner", () => {
    const point = { lat: 13.005, lon: 121.005 }; // inside MUNI_A
    const result = nearestWithinCap(point, [MUNI_A, MUNI_B], NEAREST_CAP_KM);
    expect(result).not.toBeNull();
    expect(result?.ambiguous).toBe(false);
  });

  it("returns null for {lat:0, lon:0} (null-island sentinel)", () => {
    expect(nearestWithinCap({ lat: 0, lon: 0 }, [MUNI_A], 1000)).toBeNull();
  });

  it("returns null for a point >100km away even with capKm raised above 100", () => {
    // ~500km north of MUNI_A.
    const offsetDeg = 500 / 111.32;
    const point = { lat: 13.01 + offsetDeg, lon: 121.005 };
    expect(nearestWithinCap(point, [MUNI_A], 1000)).toBeNull();
  });

  it("GARBAGE_COORD_KM constant is 100", () => {
    expect(GARBAGE_COORD_KM).toBe(100);
  });

  it("returns null for an empty municipality array", () => {
    expect(nearestWithinCap({ lat: 13.005, lon: 121.005 }, [])).toBeNull();
  });

  it("rejects non-finite lat/lon", () => {
    expect(nearestWithinCap({ lat: NaN, lon: 121.0 }, [MUNI_A])).toBeNull();
    expect(nearestWithinCap({ lat: 13.0, lon: Infinity }, [MUNI_A])).toBeNull();
  });

  it("rejects out-of-range lat/lon", () => {
    expect(nearestWithinCap({ lat: 999, lon: 121.0 }, [MUNI_A])).toBeNull();
    expect(nearestWithinCap({ lat: 13.0, lon: 999 }, [MUNI_A])).toBeNull();
  });
});
