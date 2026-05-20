// derive-area.test.ts
// Unit tests for deriveArea — composite per v2 spec L531-L561.
// Name match wins. Falls back to nearest within 5km. Returns null otherwise.

import { describe, it, expect } from "vitest";
import { deriveArea } from "../derive-area";
import type { AreaBoundaryForDerivation } from "../types";

function makeBoundary(
  overrides: Partial<AreaBoundaryForDerivation> = {},
): AreaBoundaryForDerivation {
  return {
    id: "boundary-1",
    name: "Apo Reef",
    aliases: [],
    isEnabled: true,
    geometryType: "Polygon",
    geometryGeojson: {
      type: "Polygon",
      coordinates: [
        [
          [120.0, 12.0],
          [120.1, 12.0],
          [120.1, 12.1],
          [120.0, 12.1],
          [120.0, 12.0],
        ],
      ],
    },
    ...overrides,
  };
}

describe("deriveArea", () => {
  it("returns name match when areaName matches a boundary name", () => {
    const b = makeBoundary({ id: "b-1", name: "Apo Reef" });
    const result = deriveArea({ areaName: "Apo Reef" }, [b]);
    expect(result).toEqual({ areaBoundaryId: "b-1", matchedVia: "name" });
  });

  it("returns name match (case-insensitive)", () => {
    const b = makeBoundary({ id: "b-1", name: "Apo Reef" });
    const result = deriveArea({ areaName: "apo reef" }, [b]);
    expect(result).toEqual({ areaBoundaryId: "b-1", matchedVia: "name" });
  });

  it("returns name match via alias", () => {
    const b = makeBoundary({
      id: "b-1",
      name: "Apo Reef",
      aliases: ["Apo Reef Park"],
    });
    const result = deriveArea({ areaName: "Apo Reef Park" }, [b]);
    expect(result).toEqual({ areaBoundaryId: "b-1", matchedVia: "name" });
  });

  it("falls back to nearest when areaName missing but point provided", () => {
    const b = makeBoundary({ id: "b-1" });
    // Point within 5 km of boundary edge.
    const result = deriveArea(
      { point: { lat: 12.05, lon: 120.105 } },
      [b],
    );
    expect(result).toEqual({ areaBoundaryId: "b-1", matchedVia: "nearest" });
  });

  it("falls back to nearest when areaName does not match but point provided", () => {
    const b = makeBoundary({ id: "b-1", name: "Apo Reef" });
    const result = deriveArea(
      {
        areaName: "Tubbataha Reef",
        point: { lat: 12.05, lon: 120.105 },
      },
      [b],
    );
    expect(result).toEqual({ areaBoundaryId: "b-1", matchedVia: "nearest" });
  });

  it("name match takes precedence over nearest (both could apply)", () => {
    // b1 matches by NAME ("Apo Reef")
    // b2 is closer GEOGRAPHICALLY to the point
    const b1 = makeBoundary({
      id: "b-1",
      name: "Apo Reef",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.0, 12.0],
            [120.1, 12.0],
            [120.1, 12.1],
            [120.0, 12.1],
            [120.0, 12.0],
          ],
        ],
      },
    });
    const b2 = makeBoundary({
      id: "b-2",
      name: "Other Reserve",
      geometryGeojson: {
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
    });
    // Point right next to b2 — would match b2 by nearest if name match failed.
    const point = { lat: 13.005, lon: 121.005 };
    const result = deriveArea({ areaName: "Apo Reef", point }, [b1, b2]);
    expect(result).toEqual({ areaBoundaryId: "b-1", matchedVia: "name" });
  });

  it("returns null/null when no inputs provided", () => {
    const b = makeBoundary();
    const result = deriveArea({}, [b]);
    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
  });

  it("returns null/null when areaName does not match AND no point", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    const result = deriveArea({ areaName: "Tubbataha Reef" }, [b]);
    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
  });

  it("returns null/null when point beyond threshold AND no areaName match", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    const result = deriveArea(
      {
        areaName: "Tubbataha Reef",
        point: { lat: 50.0, lon: 50.0 }, // far away
      },
      [b],
    );
    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
  });

  it("returns null/null when point provided but no boundary within threshold", () => {
    const b = makeBoundary();
    const result = deriveArea(
      { point: { lat: 50.0, lon: 50.0 } },
      [b],
    );
    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
  });

  it("handles null areaName and null point", () => {
    const b = makeBoundary();
    const result = deriveArea({ areaName: null, point: null }, [b]);
    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
  });

  it("returns null/null when boundaries list is empty", () => {
    const result = deriveArea(
      {
        areaName: "Apo Reef",
        point: { lat: 12.05, lon: 120.105 },
      },
      [],
    );
    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
  });

  it("name match path works with whitespace and case differences", () => {
    const b = makeBoundary({ id: "b-1", name: "Apo Reef" });
    const result = deriveArea({ areaName: "  APO REEF  " }, [b]);
    expect(result).toEqual({ areaBoundaryId: "b-1", matchedVia: "name" });
  });
});
