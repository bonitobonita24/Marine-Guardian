import { describe, it, expect } from "vitest";
import {
  PATROL_TRACK_STYLES,
  PATROL_TRACK_TYPES,
  DEFAULT_TRACK_VISIBILITY,
  patrolTrackStyle,
  filterVisibleTracks,
  gridDedupeTrackPoints,
  HEAT_TRACK_GRID_DEG,
  type PatrolType,
} from "../patrolTrackStyle";

describe("patrolTrackStyle", () => {
  it("differentiates seaborne and foot by BOTH color and line pattern", () => {
    const seaborne = patrolTrackStyle("seaborne");
    const foot = patrolTrackStyle("foot");

    // Distinct accent colors (non-color cue is the dash pattern below).
    expect(seaborne.color).not.toBe(foot.color);
    expect(seaborne.color).toBe("#00C9DB"); // info token
    expect(foot.color).toBe("#E8912D"); // warning token

    // Seaborne solid, foot dashed — the colorblind-safe non-color cue.
    expect(seaborne.dashArray).toBeNull();
    expect(foot.dashArray).toEqual([2, 2]);
  });

  it("provides a text label for every type (legend is never color-only)", () => {
    for (const type of PATROL_TRACK_TYPES) {
      const style = PATROL_TRACK_STYLES[type];
      expect(style.label.length).toBeGreaterThan(0);
    }
  });

  it("defaults all types to visible", () => {
    expect(DEFAULT_TRACK_VISIBILITY).toEqual({ seaborne: true, foot: true });
  });
});

describe("filterVisibleTracks", () => {
  const tracks: { patrolId: string; patrolType: PatrolType }[] = [
    { patrolId: "a", patrolType: "seaborne" },
    { patrolId: "b", patrolType: "foot" },
    { patrolId: "c", patrolType: "seaborne" },
  ];

  it("returns no tracks when the master toggle is off", () => {
    expect(
      filterVisibleTracks(tracks, false, DEFAULT_TRACK_VISIBILITY),
    ).toEqual([]);
  });

  it("returns all tracks when everything is visible", () => {
    expect(
      filterVisibleTracks(tracks, true, DEFAULT_TRACK_VISIBILITY),
    ).toHaveLength(3);
  });

  it("hides a type when its per-type toggle is off", () => {
    const result = filterVisibleTracks(tracks, true, {
      seaborne: true,
      foot: false,
    });
    expect(result.map((t) => t.patrolId)).toEqual(["a", "c"]);
  });

  it("hides everything when both types are off even if master is on", () => {
    expect(
      filterVisibleTracks(tracks, true, { seaborne: false, foot: false }),
    ).toEqual([]);
  });
});

describe("gridDedupeTrackPoints (patrol-track heatmap repetition)", () => {
  const cell = HEAT_TRACK_GRID_DEG;

  it("collapses many GPS samples in one cell to a single point", () => {
    // A single pass that lingered in one ~100m cell (dense GPS sampling) must
    // NOT stack heat by itself — it collapses to one point. Anchor at a cell
    // centre so the small jitter can't cross a rounding boundary.
    const lonCentre = Math.round(121.0 / cell) * cell + cell / 2;
    const latCentre = Math.round(13.0 / cell) * cell + cell / 2;
    const dense = Array.from({ length: 20 }, (_, i) => ({
      lon: lonCentre + i * (cell / 1000),
      lat: latCentre + i * (cell / 1000),
    }));
    expect(gridDedupeTrackPoints(dense)).toHaveLength(1);
  });

  it("keeps one point per distinct cell a track passes through", () => {
    const line = [
      { lon: 121.0, lat: 13.0 },
      { lon: 121.0 + cell, lat: 13.0 },
      { lon: 121.0 + 2 * cell, lat: 13.0 },
    ];
    expect(gridDedupeTrackPoints(line)).toHaveLength(3);
  });

  it("two separate passes over the same cell yield TWO points (repetition = heat)", () => {
    // Each track is deduped independently, then concatenated — so a cell
    // covered by 2 patrols contributes 2 points → higher heat density.
    const passA = gridDedupeTrackPoints([{ lon: 121.0, lat: 13.0 }]);
    const passB = gridDedupeTrackPoints([{ lon: 121.0 + cell / 4, lat: 13.0 }]);
    const combined = [...passA, ...passB];
    expect(combined).toHaveLength(2);
  });
});
