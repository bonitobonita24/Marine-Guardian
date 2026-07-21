// @vitest-environment node
//
// Unit tests for zone-attribution BACKFILL-ONLY pure functions.

import { describe, it, expect } from "vitest";
import { matchZoneTitleHint, MIN_TITLE_LENGTH } from "../index.js";

describe("matchZoneTitleHint", () => {
  it("matches 'FOOT PATROL-Sablayan Apo Reef-Charles-Aivan-07-18-26' → apo-reef-natural-park", () => {
    expect(matchZoneTitleHint("FOOT PATROL-Sablayan Apo Reef-Charles-Aivan-07-18-26")).toEqual({
      slug: "apo-reef-natural-park",
      hint: "apo reef",
    });
  });

  it("matches 'SABLAYAN APO REEP- Joseph' (typo) → apo-reef-natural-park", () => {
    const result = matchZoneTitleHint("SABLAYAN APO REEP- Joseph");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("apo-reef-natural-park");
  });

  it("matches 'SABLAYAN APO REF Joseph' (typo) → apo-reef-natural-park", () => {
    const result = matchZoneTitleHint("SABLAYAN APO REF Joseph");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("apo-reef-natural-park");
  });

  it("matches 'Apo reef natural park' → apo-reef-natural-park", () => {
    const result = matchZoneTitleHint("Apo reef natural park");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("apo-reef-natural-park");
  });

  it("matches 'CALAPAN Harka Piloto patrol' → harka-piloto-mpa", () => {
    expect(matchZoneTitleHint("CALAPAN Harka Piloto patrol")).toEqual({
      slug: "harka-piloto-mpa",
      hint: "harka piloto",
    });
  });

  it("matches 'Harka sanctuary check' → harka-piloto-mpa", () => {
    expect(matchZoneTitleHint("Harka sanctuary check")).toEqual({
      slug: "harka-piloto-mpa",
      hint: "harka",
    });
  });

  it("returns null for null title", () => {
    expect(matchZoneTitleHint(null)).toBeNull();
  });

  it("returns null for empty title", () => {
    expect(matchZoneTitleHint("")).toBeNull();
  });

  it(`returns null for a title shorter than MIN_TITLE_LENGTH (${String(MIN_TITLE_LENGTH)})`, () => {
    expect(matchZoneTitleHint("abc")).toBeNull();
  });

  it("returns null when no zone token is present", () => {
    expect(matchZoneTitleHint("Sablayan coastal patrol Joseph")).toBeNull();
  });

  it("returns null when hints imply two DIFFERENT zones (ambiguous)", () => {
    expect(matchZoneTitleHint("Apo reef and Harka patrol")).toBeNull();
  });

  it("does NOT match 'apo' as a substring inside 'Apostrophe' (whole-token guard)", () => {
    expect(matchZoneTitleHint("Apostrophe station")).toBeNull();
  });
});
