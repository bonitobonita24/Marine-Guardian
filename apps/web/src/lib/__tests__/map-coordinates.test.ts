import { describe, expect, it } from "vitest";
import {
  filterValidLatLonPairs,
  filterValidLonLatPairs,
  filterValidMapPoints,
  isValidMapCoordinate,
} from "../map-coordinates";

// The four real dev-DB event rows that triggered this fix (verified
// 2026-07-20). All four carry location_lat = 0 AND location_lon = 0.
const NULL_ISLAND_EVENT_IDS = [
  "cmqerkwjx0m19gm6div823ay7",
  "cmqerko100lnxgm6d8kj4rv1z",
  "cmqeroc0g0pi5gm6dni8gede6",
  "cmqerkwjt0m15gm6dlq5liq7a",
];

// Representative real Philippine coordinates from the affected report scope.
const MINDORO = { lat: 13.6, lon: 121.26 };

describe("isValidMapCoordinate", () => {
  it("accepts a real coordinate", () => {
    expect(isValidMapCoordinate(MINDORO.lat, MINDORO.lon)).toBe(true);
  });

  it("rejects exact (0,0) Null Island", () => {
    expect(isValidMapCoordinate(0, 0)).toBe(false);
  });

  it("accepts a coordinate with only ONE zero component", () => {
    // Only the exact (0,0) pair is the sentinel — a real reading on the
    // equator or the prime meridian must survive.
    expect(isValidMapCoordinate(0, 121.26)).toBe(true);
    expect(isValidMapCoordinate(13.6, 0)).toBe(true);
  });

  it("rejects null and undefined coordinates", () => {
    expect(isValidMapCoordinate(null, null)).toBe(false);
    expect(isValidMapCoordinate(undefined, undefined)).toBe(false);
    expect(isValidMapCoordinate(null, 121.26)).toBe(false);
    expect(isValidMapCoordinate(13.6, null)).toBe(false);
    expect(isValidMapCoordinate(undefined, 121.26)).toBe(false);
    expect(isValidMapCoordinate(13.6, undefined)).toBe(false);
  });

  it("rejects non-finite coordinates that would poison a bounds box", () => {
    expect(isValidMapCoordinate(Number.NaN, 121.26)).toBe(false);
    expect(isValidMapCoordinate(13.6, Number.NaN)).toBe(false);
    expect(isValidMapCoordinate(Number.POSITIVE_INFINITY, 121.26)).toBe(false);
    expect(isValidMapCoordinate(13.6, Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("rejects coordinates outside the WGS84 domain", () => {
    expect(isValidMapCoordinate(91, 121.26)).toBe(false);
    expect(isValidMapCoordinate(-90.5, 121.26)).toBe(false);
    expect(isValidMapCoordinate(13.6, 180.1)).toBe(false);
    expect(isValidMapCoordinate(13.6, -181)).toBe(false);
  });

  it("accepts the exact domain edges", () => {
    expect(isValidMapCoordinate(90, 180)).toBe(true);
    expect(isValidMapCoordinate(-90, -180)).toBe(true);
  });

  it("does NOT apply a region gate — coordinates far from the deployment survive", () => {
    // Deliberate: MG harvests from ANY EarthRanger server, so a hard
    // Philippines bbox would silently drop legitimate data elsewhere.
    expect(isValidMapCoordinate(51.5, -0.12)).toBe(true); // London
    expect(isValidMapCoordinate(-33.87, 151.21)).toBe(true); // Sydney
  });
});

describe("filterValidMapPoints", () => {
  const getLat = (p: { lat: number | null; lon: number | null }) => p.lat;
  const getLon = (p: { lat: number | null; lon: number | null }) => p.lon;

  it("drops the four real (0,0) dev-DB events and keeps the real cluster", () => {
    const points = [
      ...NULL_ISLAND_EVENT_IDS.map((id) => ({ id, lat: 0, lon: 0 })),
      { id: "real-a", lat: 13.6, lon: 121.26 },
      { id: "real-b", lat: 13.4, lon: 121.1 },
    ];

    const kept = filterValidMapPoints(points, getLat, getLon);

    expect(kept.map((p) => p.id)).toEqual(["real-a", "real-b"]);
    // The source array is never mutated — the caller still has every event for
    // its counts, lists and tables.
    expect(points).toHaveLength(6);
  });

  it("drops null/undefined coordinates", () => {
    const points = [
      { id: "no-lat", lat: null, lon: 121.26 },
      { id: "no-lon", lat: 13.6, lon: null },
      { id: "neither", lat: null, lon: null },
      { id: "good", lat: 13.6, lon: 121.26 },
    ];

    expect(filterValidMapPoints(points, getLat, getLon).map((p) => p.id)).toEqual([
      "good",
    ]);
  });

  it("leaves an all-valid set completely unaffected", () => {
    const points = [
      { id: "a", lat: 13.6, lon: 121.26 },
      { id: "b", lat: 13.4, lon: 121.1 },
      { id: "c", lat: 12.9, lon: 120.8 },
    ];

    const kept = filterValidMapPoints(points, getLat, getLon);

    expect(kept).toEqual(points);
    expect(kept).toHaveLength(3);
  });

  it("returns an empty array when every point is invalid", () => {
    const points = [
      { id: "a", lat: 0, lon: 0 },
      { id: "b", lat: null, lon: null },
      { id: "c", lat: Number.NaN, lon: Number.NaN },
    ];

    // Callers treat empty as "nothing to frame" and fall back to their default
    // view rather than computing NaN bounds.
    expect(filterValidMapPoints(points, getLat, getLon)).toEqual([]);
  });
});

describe("filterValidLatLonPairs", () => {
  it("drops (0,0) from a Leaflet [lat, lon] list", () => {
    const pairs: Array<[number, number]> = [
      [0, 0],
      [13.6, 121.26],
      [13.4, 121.1],
    ];

    expect(filterValidLatLonPairs(pairs)).toEqual([
      [13.6, 121.26],
      [13.4, 121.1],
    ]);
  });

  it("preserves a third heat-intensity element on surviving tuples", () => {
    const pairs: Array<[number, number, number]> = [
      [0, 0, 15],
      [13.6, 121.26, 15],
    ];

    expect(filterValidLatLonPairs(pairs)).toEqual([[13.6, 121.26, 15]]);
  });

  it("drops non-finite tuples", () => {
    const pairs: Array<[number, number]> = [
      [Number.NaN, 121.26],
      [13.6, Number.POSITIVE_INFINITY],
      [13.6, 121.26],
    ];

    expect(filterValidLatLonPairs(pairs)).toEqual([[13.6, 121.26]]);
  });

  it("returns empty when all pairs are invalid", () => {
    const pairs: Array<[number, number]> = [
      [0, 0],
      [0, 0],
    ];

    expect(filterValidLatLonPairs(pairs)).toEqual([]);
  });
});

describe("filterValidLonLatPairs", () => {
  it("drops (0,0) from a MapLibre [lon, lat] list", () => {
    const pairs: Array<[number, number]> = [
      [0, 0],
      [121.26, 13.6],
    ];

    expect(filterValidLonLatPairs(pairs)).toEqual([[121.26, 13.6]]);
  });

  it("reads the tuple in lon/lat order, not lat/lon", () => {
    // [lon=181, lat=13.6] is out of domain and must be rejected; the mirrored
    // [lon=13.6, lat=181] must also be rejected. If the order were misread,
    // exactly one of these would wrongly survive.
    expect(filterValidLonLatPairs([[181, 13.6] as [number, number]])).toEqual([]);
    expect(filterValidLonLatPairs([[13.6, 181] as [number, number]])).toEqual([]);
    // A latitude of 100 is invalid but a LONGITUDE of 100 is fine.
    expect(filterValidLonLatPairs([[100, 13.6] as [number, number]])).toEqual([
      [100, 13.6],
    ]);
  });

  it("leaves an all-valid list unaffected", () => {
    const pairs: Array<[number, number]> = [
      [121.26, 13.6],
      [121.1, 13.4],
    ];

    expect(filterValidLonLatPairs(pairs)).toEqual(pairs);
  });
});
