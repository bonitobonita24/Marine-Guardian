import { describe, expect, it } from "vitest";
import type { AreaBoundaryForDerivation } from "../../area-derivation";
import {
  attributePatrolToArea,
  countPatrolsByArea,
  featureMatchesArea,
  nearestStartArea,
} from "../index";

// Two enabled square polygons + one disabled — geometry is small so the
// haversine + equirectangular projection at the 5 km scale is exact
// enough for these assertions.
//
// boundary "alpha" — centered roughly on Mindoro NE coast:
//   13.000–13.020 lat, 120.000–120.020 lon (≈ 2.2 km square)
// boundary "bravo" — well outside the 5 km threshold of alpha:
//   13.500–13.520 lat, 120.500–120.520 lon
// boundary "charlie" — disabled, sits between alpha and bravo:
//   13.200–13.220 lat, 120.200–120.220 lon

const ALPHA: AreaBoundaryForDerivation = {
  id: "boundary-alpha",
  name: "Alpha Reef",
  aliases: ["Alpha", "Reef A"],
  isEnabled: true,
  geometryType: "Polygon",
  geometryGeojson: {
    type: "Polygon",
    coordinates: [
      [
        [120.0, 13.0],
        [120.02, 13.0],
        [120.02, 13.02],
        [120.0, 13.02],
        [120.0, 13.0],
      ],
    ],
  },
};

const BRAVO: AreaBoundaryForDerivation = {
  id: "boundary-bravo",
  name: "Bravo Bank",
  aliases: [],
  isEnabled: true,
  geometryType: "Polygon",
  geometryGeojson: {
    type: "Polygon",
    coordinates: [
      [
        [120.5, 13.5],
        [120.52, 13.5],
        [120.52, 13.52],
        [120.5, 13.52],
        [120.5, 13.5],
      ],
    ],
  },
};

const CHARLIE_DISABLED: AreaBoundaryForDerivation = {
  id: "boundary-charlie",
  name: "Charlie Channel",
  aliases: ["Charlie"],
  isEnabled: false,
  geometryType: "Polygon",
  geometryGeojson: {
    type: "Polygon",
    coordinates: [
      [
        [120.2, 13.2],
        [120.22, 13.2],
        [120.22, 13.22],
        [120.2, 13.22],
        [120.2, 13.2],
      ],
    ],
  },
};

const ALL = [ALPHA, BRAVO, CHARLIE_DISABLED];

describe("nearestStartArea", () => {
  it("returns the full boundary object when start lies inside the polygon", () => {
    const result = nearestStartArea({ lat: 13.01, lon: 120.01 }, ALL);
    expect(result?.id).toBe("boundary-alpha");
    expect(result?.name).toBe("Alpha Reef");
  });

  it("returns null when startLocation is null", () => {
    expect(nearestStartArea(null, ALL)).toBeNull();
  });

  it("returns null when startLocation is undefined", () => {
    expect(nearestStartArea(undefined, ALL)).toBeNull();
  });

  it("returns null when nearest enabled boundary is beyond the threshold", () => {
    // point ~80km from both alpha and bravo — way outside 5km default
    expect(nearestStartArea({ lat: 12.0, lon: 119.0 }, ALL)).toBeNull();
  });

  it("never returns a disabled boundary even when it is geographically nearest", () => {
    // Centered exactly inside Charlie's bounding box.
    // Charlie is closer than Alpha or Bravo but disabled, so result is null
    // (because Alpha + Bravo are >5km away).
    const result = nearestStartArea({ lat: 13.21, lon: 120.21 }, ALL);
    expect(result).toBeNull();
  });

  it("respects a custom threshold override", () => {
    // ~22 km away from alpha (well outside 5km, well inside 30km)
    const result = nearestStartArea({ lat: 13.21, lon: 120.21 }, ALL, 30);
    // With 30 km threshold, Alpha is closest enabled — Charlie disabled, Bravo further.
    expect(result?.id).toBe("boundary-alpha");
  });
});

describe("featureMatchesArea", () => {
  it("matches by exact name (case-insensitive + trimmed)", () => {
    expect(featureMatchesArea("  alpha reef  ", ALL)?.id).toBe(
      "boundary-alpha",
    );
  });

  it("matches by alias when name does not match", () => {
    expect(featureMatchesArea("Reef A", ALL)?.id).toBe("boundary-alpha");
  });

  it("returns null for empty / whitespace / null / undefined", () => {
    expect(featureMatchesArea("", ALL)).toBeNull();
    expect(featureMatchesArea("   ", ALL)).toBeNull();
    expect(featureMatchesArea(null, ALL)).toBeNull();
    expect(featureMatchesArea(undefined, ALL)).toBeNull();
  });

  it("never matches a disabled boundary even when the name is exact", () => {
    expect(featureMatchesArea("Charlie Channel", ALL)).toBeNull();
    expect(featureMatchesArea("Charlie", ALL)).toBeNull();
  });

  it("returns null when no boundary matches", () => {
    expect(featureMatchesArea("Delta Domain", ALL)).toBeNull();
  });
});

describe("attributePatrolToArea", () => {
  it("uses nearest start area as the primary strategy", () => {
    const result = attributePatrolToArea(
      {
        id: "patrol-1",
        startLocation: { lat: 13.01, lon: 120.01 },
        areaName: "Bravo Bank", // intentionally mismatched — nearest should win
      },
      ALL,
    );
    expect(result.areaBoundaryId).toBe("boundary-alpha");
    expect(result.matchedVia).toBe("nearest");
  });

  it("falls back to feature-name match when start is out of threshold", () => {
    const result = attributePatrolToArea(
      {
        id: "patrol-2",
        startLocation: { lat: 12.0, lon: 119.0 }, // ~110km from any boundary
        areaName: "Bravo Bank",
      },
      ALL,
    );
    expect(result.areaBoundaryId).toBe("boundary-bravo");
    expect(result.matchedVia).toBe("feature-name");
  });

  it("falls back to feature-name match when start is null", () => {
    const result = attributePatrolToArea(
      { id: "patrol-3", startLocation: null, areaName: "Alpha Reef" },
      ALL,
    );
    expect(result.areaBoundaryId).toBe("boundary-alpha");
    expect(result.matchedVia).toBe("feature-name");
  });

  it("returns null match when neither strategy resolves", () => {
    const result = attributePatrolToArea(
      { id: "patrol-4", startLocation: null, areaName: "Unknown Bay" },
      ALL,
    );
    expect(result.areaBoundaryId).toBeNull();
    expect(result.matchedVia).toBeNull();
  });

  it("never attributes to a disabled boundary even when name matches", () => {
    const result = attributePatrolToArea(
      { id: "patrol-5", startLocation: null, areaName: "Charlie" },
      ALL,
    );
    expect(result.areaBoundaryId).toBeNull();
    expect(result.matchedVia).toBeNull();
  });

  it("preserves patrol id on every result", () => {
    const result = attributePatrolToArea(
      { id: "patrol-xyz", startLocation: null, areaName: null },
      ALL,
    );
    expect(result.patrolId).toBe("patrol-xyz");
  });
});

describe("countPatrolsByArea", () => {
  it("returns one row per enabled boundary in input order with count=0 for boundaries with no patrols", () => {
    const enabled = [ALPHA, BRAVO];
    const attributions = [
      { patrolId: "p1", areaBoundaryId: "boundary-alpha", matchedVia: "nearest" as const },
      { patrolId: "p2", areaBoundaryId: "boundary-alpha", matchedVia: "feature-name" as const },
    ];

    const { rows, unattributedCount } = countPatrolsByArea(attributions, enabled);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.areaBoundaryId).toBe("boundary-alpha");
    expect(rows[0]?.patrolCount).toBe(2);
    expect(rows[1]?.areaBoundaryId).toBe("boundary-bravo");
    expect(rows[1]?.patrolCount).toBe(0);
    expect(unattributedCount).toBe(0);
  });

  it("tallies unattributed (null areaBoundaryId) separately from boundary rows", () => {
    const enabled = [ALPHA];
    const attributions = [
      { patrolId: "p1", areaBoundaryId: "boundary-alpha", matchedVia: "nearest" as const },
      { patrolId: "p2", areaBoundaryId: null, matchedVia: null },
      { patrolId: "p3", areaBoundaryId: null, matchedVia: null },
    ];

    const { rows, unattributedCount } = countPatrolsByArea(attributions, enabled);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.patrolCount).toBe(1);
    expect(unattributedCount).toBe(2);
  });

  it("returns empty rows array when boundaries is empty (all patrols are unattributed)", () => {
    const attributions = [
      { patrolId: "p1", areaBoundaryId: null, matchedVia: null },
      { patrolId: "p2", areaBoundaryId: null, matchedVia: null },
    ];

    const { rows, unattributedCount } = countPatrolsByArea(attributions, []);

    expect(rows).toEqual([]);
    expect(unattributedCount).toBe(2);
  });
});
