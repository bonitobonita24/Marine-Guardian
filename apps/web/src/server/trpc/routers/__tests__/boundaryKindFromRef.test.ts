import { describe, it, expect } from "vitest";
import { boundaryKindFromRef, municipalityIdFromRef } from "../boundary-kind";

describe("boundaryKindFromRef", () => {
  it("classifies municipality water vs land by ref suffix", () => {
    expect(boundaryKindFromRef("official:calapan-city:water")).toBe("water");
    expect(boundaryKindFromRef("official:calapan-city:land")).toBe("land");
  });

  it("classifies MPA refs", () => {
    expect(boundaryKindFromRef("official:mpa:apo-reef-natural-park")).toBe("mpa");
    expect(boundaryKindFromRef("official:mpa:harka-piloto-mpa")).toBe("mpa");
  });

  it("defaults to land for null or unrecognized refs", () => {
    expect(boundaryKindFromRef(null)).toBe("land");
    expect(boundaryKindFromRef("something-else")).toBe("land");
  });
});

describe("municipalityIdFromRef", () => {
  const slugToId = new Map([
    ["calapan-city", "muni-calapan"],
    ["puerto-galera", "muni-pg"],
  ]);

  it("resolves municipality id for land and water refs", () => {
    expect(municipalityIdFromRef("official:calapan-city:land", slugToId)).toBe(
      "muni-calapan",
    );
    expect(municipalityIdFromRef("official:calapan-city:water", slugToId)).toBe(
      "muni-calapan",
    );
    expect(municipalityIdFromRef("official:puerto-galera:water", slugToId)).toBe(
      "muni-pg",
    );
  });

  it("returns undefined for MPA refs", () => {
    expect(
      municipalityIdFromRef("official:mpa:apo-reef-natural-park", slugToId),
    ).toBeUndefined();
  });

  it("returns undefined for unknown slugs, null, or malformed refs", () => {
    expect(municipalityIdFromRef("official:unknown-town:land", slugToId)).toBeUndefined();
    expect(municipalityIdFromRef(null, slugToId)).toBeUndefined();
    expect(municipalityIdFromRef("something-else", slugToId)).toBeUndefined();
    expect(municipalityIdFromRef("official:calapan-city", slugToId)).toBeUndefined();
  });
});
