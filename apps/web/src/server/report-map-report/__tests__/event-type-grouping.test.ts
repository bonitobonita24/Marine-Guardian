// Per-event-type grouping for the printable Report Map event tables (S2).
// Verifies: group-by-type + ordering, per-type detailKeys union (first-seen
// order, non-object details ignored), hasAnyPhoto, key humanization, and
// value formatting (primitives / arrays / ER choice objects / blanks).

import { describe, it, expect } from "vitest";
import {
  buildEventColumns,
  detailCell,
  formatDetailValue,
  groupEventsByType,
  humanizeDetailKey,
  isHumanReadableColumn,
  splitEventColumns,
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

/** Groups `events` and returns the first group, throwing if there is none. */
function firstGroup(events: ReportMapEventDetail[]) {
  const [g] = groupEventsByType(events);
  if (g === undefined) throw new Error("expected at least one group");
  return g;
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

describe("isHumanReadableColumn", () => {
  it("drops a known machine-audit key regardless of its values", () => {
    expect(isHumanReadableColumn("updates", ["Dugong"])).toBe(false);
    expect(isHumanReadableColumn("eventDetails", ["Dugong"])).toBe(false);
  });

  it("drops a key whose values are predominantly JSON-object/array shaped", () => {
    const auditValues = [
      { text: "", time: "2026-06-15T00:00:00Z", type: "add_eventdetails", user: { id: "u1" } },
      { text: "note", time: "2026-06-16T00:00:00Z", type: "edit", user: { id: "u2" } },
    ];
    expect(isHumanReadableColumn("log_entries", auditValues)).toBe(false);
  });

  it("keeps a genuine human field, including ER choice payloads and blanks", () => {
    expect(isHumanReadableColumn("vessel_name", ["MB Rosa", "MB Luz"])).toBe(true);
    expect(
      isHumanReadableColumn("gear_type", [{ name: "Hulbot-hulbot", value: "hh" }]),
    ).toBe(true);
    expect(isHumanReadableColumn("remarks", [null, "", undefined])).toBe(true);
  });
});

describe("groupEventsByType — machine-JSON column exclusion", () => {
  it("excludes the Updates column while keeping human ER fields", () => {
    const groups = groupEventsByType([
      makeEvent({
        id: "1",
        typeDisplay: "Illegal Fishing",
        eventDetailsJson: {
          vessel_name: "MB Rosa",
          action_taken: "Apprehended",
          updates: {
            text: "",
            time: "2026-06-15T00:00:00Z",
            type: "add_eventdetails",
            user: { id: "u1", name: "Officer Cruz" },
          },
        },
      }),
    ]);
    const g = groups.find((x) => x.type === "Illegal Fishing");
    expect(g?.detailKeys).toEqual(["vessel_name", "action_taken"]);
    expect(g?.detailKeys).not.toContain("updates");
  });
});

describe("buildEventColumns / splitEventColumns", () => {
  it("builds the fixed + dynamic + photo column order for a group", () => {
    const g = firstGroup([
      makeEvent({
        id: "1",
        typeDisplay: "T",
        eventDetailsJson: { vessel_name: "MB Rosa" },
        photoAssetIds: ["a1"],
      }),
    ]);
    const columns = buildEventColumns(g);
    expect(columns.map((c) => c.kind)).toEqual([
      "reportedAt",
      "title",
      "municipality",
      "area",
      "reporter",
      "detail",
      "photo",
    ]);
    expect(columns.map((c) => c.label)).toEqual([
      "Reported At",
      "Title",
      "Municipality",
      "Barangay / Area",
      "Reporter",
      "Vessel Name",
      "Photo",
    ]);
  });

  it("splits a wide column set into two halves with identity columns repeated on both", () => {
    const g = firstGroup([
      makeEvent({
        id: "1",
        typeDisplay: "T",
        eventDetailsJson: {
          k1: "a",
          k2: "b",
          k3: "c",
          k4: "d",
          k5: "e",
          k6: "f",
          k7: "g",
          k8: "h",
        },
      }),
    ]);
    const split = splitEventColumns(g);
    // Identity columns lead BOTH pages.
    expect(split.page1.slice(0, 2).map((c) => c.kind)).toEqual([
      "reportedAt",
      "title",
    ]);
    expect(split.page2.slice(0, 2).map((c) => c.kind)).toEqual([
      "reportedAt",
      "title",
    ]);
    // Every non-identity column appears exactly once across both halves.
    const restKeys = [...split.page1, ...split.page2]
      .filter((c) => c.kind !== "reportedAt" && c.kind !== "title")
      .map((c) => c.key ?? c.kind);
    expect(new Set(restKeys).size).toBe(restKeys.length);
    expect(restKeys).toEqual(
      expect.arrayContaining(["municipality", "area", "reporter", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"]),
    );
    expect(split.page2.length).toBeGreaterThan(0);
  });

  it("returns an empty page2 when the column set already fits on one page", () => {
    const g = firstGroup([
      makeEvent({ id: "1", typeDisplay: "T", eventDetailsJson: { k1: "a" } }),
    ]);
    const split = splitEventColumns(g);
    expect(split.page2).toEqual([]);
    expect(split.page1.length).toBeGreaterThan(0);
  });
});
