// @vitest-environment node

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignMunicipalityToPoint,
  assignZonesToPoint,
} from "../index.js";
import type { MunicipalityForAssignment, ProtectedZoneForAssignment } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COVERAGE_DIR = resolve(
  __dirname,
  "../../../../../../apps/web/src/data/coverage",
);

function readGeojson(filename: string): unknown {
  return JSON.parse(readFileSync(resolve(COVERAGE_DIR, filename), "utf-8")) as unknown;
}

// Build minimal municipality fixture list for Calapan City.
const calapanMuni: MunicipalityForAssignment = {
  id: "muni-calapan",
  slug: "calapan-city",
  name: "Calapan City",
  boundaryGeojson: readGeojson("calapan-city.geojson"),
};

const apoZone: ProtectedZoneForAssignment = {
  id: "zone-apo-reef",
  slug: "apo-reef-natural-park",
  name: "Apo Reef Natural Park",
  boundaryGeojson: readGeojson("apo-reef-natural-park.geojson"),
};

describe("assignMunicipalityToPoint", () => {
  it("returns the municipality id for a point inside Calapan City", () => {
    // Centroid of Calapan City bounding box — well inside the polygon.
    const result = assignMunicipalityToPoint(
      { lat: 13.3818, lon: 121.1948 },
      [calapanMuni],
    );
    expect(result).toBe("muni-calapan");
  });

  it("returns null for a point in the open ocean (far from any boundary)", () => {
    // A point in the South China Sea, far from any Mindoro/Palawan polygon.
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

  it("returns null for a point clearly outside Calapan City but inside the list", () => {
    // Manila — well outside Calapan City
    const result = assignMunicipalityToPoint(
      { lat: 14.5995, lon: 120.9842 },
      [calapanMuni],
    );
    expect(result).toBeNull();
  });
});

describe("assignZonesToPoint", () => {
  it("returns zone id for a point inside Apo Reef Natural Park", () => {
    // Centroid of Apo Reef bounding box.
    const result = assignZonesToPoint(
      { lat: 12.6714, lon: 120.4792 },
      [apoZone],
    );
    expect(result).toContain("zone-apo-reef");
  });

  it("returns empty array for a point outside every zone", () => {
    // Calapan City — nowhere near Apo Reef
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
});
