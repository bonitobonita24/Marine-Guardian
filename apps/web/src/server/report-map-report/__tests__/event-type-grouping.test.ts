// Per-event-type grouping for the printable Report Map event tables (S2).
// Verifies: group-by-type + ordering, per-type detailKeys union (first-seen
// order, non-object details ignored), hasAnyPhoto, key humanization, and
// value formatting (primitives / arrays / ER choice objects / blanks).

import { describe, it, expect } from "vitest";
import {
  detailCell,
  formatDetailValue,
  groupEventsByType,
  humanizeDetailKey,
} from "../event-type-grouping";
import type { ReportMapEventDetail } from "../get-report-map-report-data";

function makeEvent(
  overrides: Partial<ReportMapEventDetail> & { id: string },
): ReportMapEventDetail {
  return {
    title: null,
    typeDisplay: "Unknown",
    priority: 0,
    reportedAt: null,
    locationName: null,
    municipalityName: null,
    areaName: null,
    reportedByName: null,
    lat: null,
    lon: null,
    eventDetailsJson: null,
    hasPhoto: false,
    photoAssetIds: [],
    ...overrides,
  };
}

describe("groupEventsByType", () => {
  it("groups by typeDisplay, busiest type first, ties alphabetical", () => {
    const groups = groupEventsByType([
      makeEvent({ id: "1", typeDisplay: "Zeta" }),
      makeEvent({ id: "2", typeDisplay: "Compressor Fishing" }),
      makeEvent({ id: "3", typeDisplay: "Compressor Fishing" }),
      makeEvent({ id: "4", typeDisplay: "Alpha" }),
    ]);
    expect(groups.map((g) => g.type)).toEqual([
      "Compressor Fishing",
      "Alpha",
      "Zeta",
    ]);
    expect(groups[0]?.events.map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("derives detailKeys as the per-type union in first-seen order", () => {
    const groups = groupEventsByType([
      makeEvent({
        id: "1",
        typeDisplay: "Compressor Fishing",
        eventDetailsJson: { boat_name: "MB Rosa", crew_count: 4 },
      }),
      makeEvent({
        id: "2",
        typeDisplay: "Compressor Fishing",
        eventDetailsJson: { crew_count: 2, apprehended: true },
      }),
      makeEvent({
        id: "3",
        typeDisplay: "Marine Wildlife Sighting",
        eventDetailsJson: { species: "Dugong" },
      }),
    ]);
    const compressor = groups.find((g) => g.type === "Compressor Fishing");
    const wildlife = groups.find((g) => g.type === "Marine Wildlife Sighting");
    expect(compressor?.detailKeys).toEqual([
      "boat_name",
      "crew_count",
      "apprehended",
    ]);
    // The other type's fields never leak between groups.
    expect(wildlife?.detailKeys).toEqual(["species"]);
  });

  it("ignores non-object eventDetailsJson (null, arrays, scalars)", () => {
    const groups = groupEventsByType([
      makeEvent({ id: "1", typeDisplay: "T", eventDetailsJson: null }),
      makeEvent({ id: "2", typeDisplay: "T", eventDetailsJson: [1, 2] }),
      makeEvent({ id: "3", typeDisplay: "T", eventDetailsJson: "oops" }),
    ]);
    expect(groups[0]?.detailKeys).toEqual([]);
  });

  it("flags hasAnyPhoto when any event in the group has photoAssetIds", () => {
    const groups = groupEventsByType([
      makeEvent({ id: "1", typeDisplay: "T" }),
      makeEvent({ id: "2", typeDisplay: "T", photoAssetIds: ["asset-9"] }),
      makeEvent({ id: "3", typeDisplay: "U" }),
    ]);
    expect(groups.find((g) => g.type === "T")?.hasAnyPhoto).toBe(true);
    expect(groups.find((g) => g.type === "U")?.hasAnyPhoto).toBe(false);
  });
});

describe("humanizeDetailKey", () => {
  it("humanizes snake_case, kebab-case, and camelCase", () => {
    expect(humanizeDetailKey("boat_registration")).toBe("Boat Registration");
    expect(humanizeDetailKey("boat-registration")).toBe("Boat Registration");
    expect(humanizeDetailKey("boatRegistration")).toBe("Boat Registration");
    expect(humanizeDetailKey("species")).toBe("Species");
  });
});

describe("formatDetailValue", () => {
  it("formats primitives and blanks", () => {
    expect(formatDetailValue("Dugong")).toBe("Dugong");
    expect(formatDetailValue("")).toBe("—");
    expect(formatDetailValue(null)).toBe("—");
    expect(formatDetailValue(undefined)).toBe("—");
    expect(formatDetailValue(true)).toBe("Yes");
    expect(formatDetailValue(false)).toBe("No");
    expect(formatDetailValue(12345)).toBe("12,345");
  });

  it("joins arrays and unwraps ER choice objects", () => {
    expect(formatDetailValue(["a", "b"])).toBe("a, b");
    expect(formatDetailValue([])).toBe("—");
    expect(formatDetailValue({ name: "Hulbot-hulbot", value: "hh" })).toBe(
      "Hulbot-hulbot",
    );
    expect(formatDetailValue({ value: "raw-code" })).toBe("raw-code");
    expect(formatDetailValue({ other: 1 })).toBe('{"other":1}');
  });
});

describe("detailCell", () => {
  it("returns the formatted value or the em-dash placeholder", () => {
    const e = makeEvent({
      id: "1",
      typeDisplay: "T",
      eventDetailsJson: { species: "Dugong" },
    });
    expect(detailCell(e, "species")).toBe("Dugong");
    expect(detailCell(e, "missing_key")).toBe("—");
    expect(detailCell(makeEvent({ id: "2" }), "species")).toBe("—");
  });
});
