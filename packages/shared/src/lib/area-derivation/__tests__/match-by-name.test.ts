// match-by-name.test.ts
// Unit tests for matchByName — exact name + alias lookup against AreaBoundary rows.
// Covers v2 spec L531-L561 step 1: exact name match (preferred), case-insensitive, trimmed,
// isEnabled=true only, name beats alias on tie.

import { describe, it, expect } from "vitest";
import { matchByName } from "../match-by-name";
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
          [120.5, 12.0],
          [120.5, 12.5],
          [120.0, 12.5],
          [120.0, 12.0],
        ],
      ],
    },
    ...overrides,
  };
}

describe("matchByName", () => {
  it("exact name match returns the boundary", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName("Apo Reef", [b])).toBe(b);
  });

  it("case-insensitive name match (uppercase input)", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName("APO REEF", [b])).toBe(b);
  });

  it("case-insensitive name match (mixed case)", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName("aPo ReEf", [b])).toBe(b);
  });

  it("alias match returns the boundary", () => {
    const b = makeBoundary({
      name: "Apo Reef",
      aliases: ["apo reef park", "apo reef natural park"],
    });
    expect(matchByName("Apo Reef Natural Park", [b])).toBe(b);
  });

  it("alias match is case-insensitive", () => {
    const b = makeBoundary({
      name: "Apo Reef",
      aliases: ["Apo Reef Park"],
    });
    expect(matchByName("APO REEF PARK", [b])).toBe(b);
  });

  it("trims leading and trailing whitespace on input", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName("  Apo Reef  ", [b])).toBe(b);
  });

  it("trims whitespace and matches alias", () => {
    const b = makeBoundary({
      name: "Apo Reef",
      aliases: ["Apo Reef Park"],
    });
    expect(matchByName("\t Apo Reef Park \n", [b])).toBe(b);
  });

  it("skips disabled boundaries (isEnabled=false)", () => {
    const b = makeBoundary({ name: "Apo Reef", isEnabled: false });
    expect(matchByName("Apo Reef", [b])).toBe(null);
  });

  it("returns null for empty string", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName("", [b])).toBe(null);
  });

  it("returns null for whitespace-only input", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName("   ", [b])).toBe(null);
  });

  it("returns null for null areaName", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName(null, [b])).toBe(null);
  });

  it("returns null for undefined areaName", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName(undefined, [b])).toBe(null);
  });

  it("returns null when no boundary matches", () => {
    const b = makeBoundary({ name: "Apo Reef" });
    expect(matchByName("Tubbataha Reef", [b])).toBe(null);
  });

  it("returns null when boundaries list is empty", () => {
    expect(matchByName("Apo Reef", [])).toBe(null);
  });

  it("name match wins over alias match when both could apply", () => {
    // If "Apo Reef" appears as the NAME of boundary-1 and as an ALIAS of boundary-2,
    // boundary-1 (the one whose name matches) should win.
    const b1 = makeBoundary({
      id: "boundary-1",
      name: "Apo Reef",
      aliases: [],
    });
    const b2 = makeBoundary({
      id: "boundary-2",
      name: "Other Reserve",
      aliases: ["Apo Reef"],
    });
    expect(matchByName("Apo Reef", [b2, b1])).toBe(b1);
  });

  it("returns first match among multiple boundaries with same name", () => {
    const b1 = makeBoundary({ id: "boundary-1", name: "Apo Reef" });
    const b2 = makeBoundary({ id: "boundary-2", name: "Apo Reef" });
    expect(matchByName("Apo Reef", [b1, b2])).toBe(b1);
  });

  it("uses alias order as tiebreaker among aliases", () => {
    const b1 = makeBoundary({
      id: "boundary-1",
      name: "Reserve A",
      aliases: ["second-alias", "primary-alias"],
    });
    const b2 = makeBoundary({
      id: "boundary-2",
      name: "Reserve B",
      aliases: ["primary-alias"],
    });
    // Both boundaries have "primary-alias" as alias; first boundary with the match wins.
    expect(matchByName("primary-alias", [b1, b2])).toBe(b1);
  });
});
