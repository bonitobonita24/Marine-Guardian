import { describe, expect, it } from "vitest";
import { geojsonToLeafletPositions } from "../geojson-to-leaflet-positions";

describe("geojsonToLeafletPositions", () => {
  it("flips [lng,lat] → [lat,lng] for a valid Polygon with one outer ring", () => {
    // Square around Mindoro coordinates — GeoJSON requires first === last
    const geojson = {
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
    };
    const result = geojsonToLeafletPositions(geojson, "Polygon");
    expect(result).toEqual({
      kind: "Polygon",
      positions: [
        [
          [13.0, 121.0],
          [13.0, 121.5],
          [13.5, 121.5],
          [13.5, 121.0],
          [13.0, 121.0],
        ],
      ],
    });
  });

  it("flips [lng,lat] → [lat,lng] for a valid LineString", () => {
    const geojson = {
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [121.5, 13.5],
        [122.0, 14.0],
      ],
    };
    const result = geojsonToLeafletPositions(geojson, "LineString");
    expect(result).toEqual({
      kind: "LineString",
      positions: [
        [13.0, 121.0],
        [13.5, 121.5],
        [14.0, 122.0],
      ],
    });
  });

  it("returns null when expectedType does not match geojson.type", () => {
    const geojson = {
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [121.5, 13.5],
      ],
    };
    expect(geojsonToLeafletPositions(geojson, "Polygon")).toBeNull();
  });

  it("returns null when LineString has fewer than 2 points", () => {
    const geojson = {
      type: "LineString",
      coordinates: [[121.0, 13.0]],
    };
    expect(geojsonToLeafletPositions(geojson, "LineString")).toBeNull();
  });

  it("returns null when Polygon outer ring has fewer than 4 points", () => {
    const geojson = {
      type: "Polygon",
      coordinates: [
        [
          [121.0, 13.0],
          [121.5, 13.5],
          [121.0, 13.0],
        ],
      ],
    };
    expect(geojsonToLeafletPositions(geojson, "Polygon")).toBeNull();
  });

  it("returns null when coordinates field is missing", () => {
    const geojson = { type: "Polygon" };
    expect(geojsonToLeafletPositions(geojson, "Polygon")).toBeNull();
  });

  it("returns null when a coordinate pair contains non-finite numbers", () => {
    const geojson = {
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [Number.NaN, 13.5],
      ],
    };
    expect(geojsonToLeafletPositions(geojson, "LineString")).toBeNull();
  });

  it("returns null for non-object input (null / string / undefined)", () => {
    expect(geojsonToLeafletPositions(null, "Polygon")).toBeNull();
    expect(geojsonToLeafletPositions("not an object", "Polygon")).toBeNull();
    expect(geojsonToLeafletPositions(undefined, "Polygon")).toBeNull();
  });
});
