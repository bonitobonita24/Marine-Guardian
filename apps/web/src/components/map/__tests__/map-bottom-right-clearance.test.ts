// Regression guard: the map's right-hand overlay column must NEVER overlap the
// map's bottom-right zoom / doodle control cluster (fix 2026-07-20, 3rd pass).
//
// Confirmed in-browser before the fix, at 768x1024 with a transient panel open:
// the panel spanned x 507-731 / y 576.5-727 while the zoom cluster sat at
// x 701-735 / y 633-699 and the doodle toggle at y 609-643 — a 30px horizontal
// by 66px vertical overlap, and `elementFromPoint` returned the PANEL at all
// three button centres, so zoom-in, zoom-out and doodle were ALL unclickable.
// The same collision existed at >= lg whenever the CHARTS panel was toggled on
// and made the column tall enough to reach down (30x66 at 1024x800).
//
// Raising z-index is NOT a fix here: the controls are z-10 and the column is
// z-20, so lifting the column further would keep the controls painted but
// still swallow their clicks.
//
// The separation is HORIZONTAL. The overlap was only 30px wide, so moving the
// column left past the cluster's inward reach removes the collision outright
// and costs no column height — unlike the first attempt, which reserved a
// 144px vertical band and left the column too short to show either chart panel
// (130px tall vs 185px/201px charts at 1280x600). This test is what keeps the
// horizontal reservation honest.
//
// Why a source-level test: the controls live inside InteractiveMap / the map
// primitive, neither of which can render in jsdom (maplibre-gl needs WebGL),
// and jsdom evaluates no Tailwind CSS and runs no layout engine — so computed
// geometry is unavailable in this environment. Instead this DERIVES the
// required clearance from the control cluster's own position AND size classes
// and asserts the column clears it. Move or resize the controls and this test
// recomputes and fails, which is exactly the coupling that must not be lost.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, ...p), "utf8");

const mapPrimitive = read("..", "..", "ui", "map.tsx");
const interactiveMap = read("..", "InteractiveMap.tsx");
const topRightColumn = read("..", "MapTopRightColumn.tsx");

/** Tailwind v3 spacing scale: 1 unit = 0.25rem = 4px. */
const unitToPx = (units: number) => units * 4;

/**
 * Width of a control box, from the ControlButton's own `size-N` class plus the
 * 1px left/right border of the rounded group that wraps it. Parsed rather than
 * hardcoded so shrinking/growing the buttons recomputes the required clearance.
 * (34px matches the measured zoom cluster at x 701-735.)
 */
const controlBoxWidthPx = (() => {
  const m = mapPrimitive.match(/"flex size-(\d+) items-center justify-center/);
  if (m?.[1] === undefined) {
    throw new Error("Could not locate the ControlButton `size-N` in ui/map.tsx");
  }
  return unitToPx(Number(m[1])) + 2;
})();

/** `right-N` offset of the map primitive's default bottom-right controls. */
const zoomRightPx = (() => {
  const m = mapPrimitive.match(/"bottom-right":\s*"bottom-\d+\s+right-(\d+)"/);
  if (m?.[1] === undefined) {
    throw new Error(
      'Could not locate positionClasses["bottom-right"] in ui/map.tsx',
    );
  }
  return unitToPx(Number(m[1]));
})();

/** `right-N` offset of InteractiveMap's doodle toggle. */
const doodleRightPx = (() => {
  const m = interactiveMap.match(/"absolute z-10 bottom-\d+ right-(\d+) /);
  if (m?.[1] === undefined) {
    throw new Error(
      "Could not locate the doodle toggle's position classes in InteractiveMap.tsx",
    );
  }
  return unitToPx(Number(m[1]));
})();

/**
 * The leftmost pixel the bottom-right cluster can reach, measured in from the
 * map's RIGHT edge. The doodle toggle is conditional (`doodleSurface`), so the
 * worst case is the greater of the two reaches.
 */
const clusterReachPx = Math.max(
  zoomRightPx + controlBoxWidthPx,
  doodleRightPx + controlBoxWidthPx,
);

/** The overlay column's own className literal. */
const columnClass = (() => {
  const m = topRightColumn.match(/"absolute bottom-[^"]*"/);
  if (m === null) {
    throw new Error(
      "Could not locate the MapTopRightColumn className in MapTopRightColumn.tsx",
    );
  }
  return m[0];
})();

/** The column's unprefixed `right-N` inset, in px. */
const columnRightPx = (() => {
  const m = columnClass.match(/(?:^|\s)right-(\d+)(?:\s|")/);
  if (m?.[1] === undefined) {
    throw new Error("MapTopRightColumn no longer declares a `right-N` inset");
  }
  return unitToPx(Number(m[1]));
})();

describe("map right-hand overlay column vs bottom-right controls", () => {
  it("derives the control cluster's reach from the controls' own classes", () => {
    // Guards the derivation itself: if these drift, every number below is
    // recomputed rather than silently stale.
    expect(controlBoxWidthPx).toBe(34); // size-8 (32px) + 1px borders
    expect(zoomRightPx).toBe(8); // right-2
    expect(doodleRightPx).toBe(8); // right-2
    expect(clusterReachPx).toBe(42); // 8 + 34
  });

  it("insets the column past the cluster's inward reach", () => {
    // This is the case browser QA confirmed broken: the column was `right-3`
    // (12px), i.e. 30px INSIDE the cluster's 42px reach.
    expect(columnRightPx).toBeGreaterThanOrEqual(clusterReachPx);
    expect(columnRightPx).toBe(44); // right-11 = 2.75rem
  });

  it("keeps a non-zero clearance band between the column and the controls", () => {
    // Not merely touching: there is real space between them.
    expect(columnRightPx - clusterReachPx).toBeGreaterThan(0);
    expect(columnRightPx - clusterReachPx).toBe(2);
  });

  it("holds in BOTH anchoring modes at every viewport", () => {
    // The separation is horizontal and the `right-N` inset is unprefixed, so
    // it applies identically below lg (bottom-anchored, growing upward) and at
    // >= lg (top-anchored, growing downward). Neither anchor may introduce a
    // breakpoint-specific right inset that could undo it.
    expect(columnClass).toContain("right-11");
    expect(columnClass).not.toMatch(/lg:right-\d/);
    expect(columnClass).toContain("lg:bottom-auto");
  });

  it("does NOT pay for the clearance with column height", () => {
    // The earlier fix reserved a 144px vertical band (`bottom-36` +
    // `max-h-[calc(100%-9.75rem)]`), which left the column too short to show
    // either chart panel at 1280x600. Height is restored to full; if someone
    // re-introduces a vertical reserve, this fails.
    expect(columnClass).toContain("bottom-3");
    expect(columnClass).not.toContain("bottom-36");
    expect(columnClass).toContain("max-h-[calc(100%-1.5rem)]");
    expect(columnClass).not.toContain("9.75rem");
  });

  it("does not try to win the collision with z-index", () => {
    // The controls are z-10 and this column z-20. Painting above them was
    // never the problem — hit-testing was. If someone "fixes" a future
    // regression by raising z-index instead of moving out of the way, the
    // controls go back to being visible-but-dead, so pin the layering as-is.
    expect(columnClass).toContain("z-20");
    expect(interactiveMap).toContain("absolute z-10 bottom-24 right-2");
    expect(mapPrimitive).toContain('"absolute z-10 flex flex-col gap-1.5"');
  });

  it("leaves the approved >= lg top alignment untouched", () => {
    // Browser QA signed off CHARTS top-aligned with MAP CONTROLS at 0px delta.
    // The clearance work must not move the top edge — only the right inset.
    expect(columnClass).toContain("lg:top-3");
  });
});
