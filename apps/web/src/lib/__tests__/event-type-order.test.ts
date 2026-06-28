import { describe, it, expect } from "vitest";
import {
  EVENT_TYPE_ORDER,
  canonicalIndex,
  normalizeTypeLabel,
} from "../event-type-order";

describe("event-type-order", () => {
  describe("canonicalIndex", () => {
    it("returns the fixed sequence position for law_enforcement types", () => {
      expect(canonicalIndex("Unregistered Illegal Fishing", "law_enforcement")).toBe(0);
      expect(canonicalIndex("Destructive Practices", "law_enforcement")).toBe(5);
    });

    it("returns the fixed sequence position for monitoring types", () => {
      expect(canonicalIndex("Marine wildlife sightings", "monitoring")).toBe(0);
      expect(canonicalIndex("Threats on Habitat", "monitoring")).toBe(4);
    });

    it("is tolerant of parentheticals, case, and punctuation", () => {
      // "(MPA)" suffix dropped, lower-cased
      expect(
        canonicalIndex("fishing in a prohibited area", "law_enforcement"),
      ).toBe(1);
      expect(
        canonicalIndex("FISHING IN A PROHIBITED AREA (mpa)", "law_enforcement"),
      ).toBe(1);
    });

    it("returns -1 for types not in the canonical sequence", () => {
      expect(canonicalIndex("Some New ER Event Type", "law_enforcement")).toBe(-1);
      expect(canonicalIndex("Others", "monitoring")).toBe(-1);
    });

    it("does not cross variants — a monitoring type is unlisted under law_enforcement", () => {
      expect(canonicalIndex("Marine wildlife sightings", "law_enforcement")).toBe(-1);
    });
  });

  describe("normalizeTypeLabel", () => {
    it("collapses casing, parentheticals, and punctuation", () => {
      expect(normalizeTypeLabel("Fishing in a prohibited area (MPA)")).toBe(
        "fishing in a prohibited area",
      );
    });
  });

  it("canonical sequences are non-empty and unique per variant", () => {
    for (const variant of ["law_enforcement", "monitoring"] as const) {
      const list = EVENT_TYPE_ORDER[variant];
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
