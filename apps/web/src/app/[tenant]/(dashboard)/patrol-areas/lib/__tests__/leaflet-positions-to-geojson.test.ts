import { describe, expect, it } from "vitest";
import { leafletPositionsToGeojson } from "../leaflet-positions-to-geojson";

describe("leafletPositionsToGeojson", () => {
  it("converts a Polygon outer ring of {lat,lng} to GeoJSON [lng,lat] rings", () => {
    const input = {
      kind: "Polygon" as const,
      positions: [
        [
          { lat: 13.0, lng: 121.0 },
          { lat: 13.0, lng: 121.5 },
          { lat: 13.5, lng: 121.5 },
          { lat: 13.5, lng: 121.0 },
          { lat: 13.0, lng: 121.0 },
        ],
      ],
    };
    const out = leafletPositionsToGeojson(input);
    expect(out).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [121.0, 13.0],
          [121.5, 13.0],
          [121.5, 13.5],
          [121.0, 13.5],
          [121.0, 13.0],
        ],
      ],
    });
  });

  it("converts a LineString of {lat,lng} to GeoJSON [lng,lat]", () => {
    const input = {
      kind: "LineString" as const,
      positions: [
        { lat: 13.0, lng: 121.0 },
        { lat: 13.5, lng: 121.5 },
      ],
    };
    const out = leafletPositionsToGeojson(input);
    expect(out).toEqual({
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [121.5, 13.5],
      ],
    });
  });

  it("auto-closes an open Polygon outer ring (geoman returns open rings)", () => {
    const input = {
      kind: "Polygon" as const,
      positions: [
        [
          { lat: 13.0, lng: 121.0 },
          { lat: 13.0, lng: 121.5 },
          { lat: 13.5, lng: 121.5 },
        ],
      ],
    };
    const out = leafletPositionsToGeojson(input);
    expect(out).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [121.0, 13.0],
          [121.5, 13.0],
          [121.5, 13.5],
          [121.0, 13.0],
        ],
      ],
    });
  });

  it("returns null for a Polygon with fewer than 3 unique vertices", () => {
    const input = {
      kind: "Polygon" as const,
      positions: [
        [
          { lat: 13.0, lng: 121.0 },
          { lat: 13.0, lng: 121.5 },
        ],
      ],
    };
    expect(leafletPositionsToGeojson(input)).toBeNull();
  });

  it("returns null for a LineString with fewer than 2 vertices", () => {
    const input = {
      kind: "LineString" as const,
      positions: [{ lat: 13.0, lng: 121.0 }],
    };
    expect(leafletPositionsToGeojson(input)).toBeNull();
  });

  it("returns null when a vertex has non-finite coordinates", () => {
    const input = {
      kind: "LineString" as const,
      positions: [
        { lat: 13.0, lng: 121.0 },
        { lat: Number.NaN, lng: 121.5 },
      ],
    };
    expect(leafletPositionsToGeojson(input)).toBeNull();
  });

  it("returns null when positions field is missing", () => {
    // @ts-expect-error - intentionally invalid input
    expect(leafletPositionsToGeojson({ kind: "Polygon" })).toBeNull();
  });

  it("returns null for unsupported kind", () => {
    // @ts-expect-error - intentionally invalid input
    expect(leafletPositionsToGeojson({ kind: "Point", positions: [] })).toBeNull();
  });
});
