// Regression guard: the map's right-hand overlay column must NEVER overlap the
// map's bottom-right zoom / doodle control cluster (fix 2026-07-20, 2nd pass).
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
// still swallow their clicks. The fix reserves VERTICAL SPACE instead, and
// this test is what keeps that reservation honest.
//
// Why a source-level test: the controls live inside InteractiveMap / the map
// primitive, neither of which can render in jsdom (maplibre-gl needs WebGL),
// and jsdom evaluates no Tailwind CSS and runs no layout engine — so computed
// geometry is unavailable in this environment. Instead this DERIVES the
// required clearance from the control cluster's own position classes and
// asserts the column reserves at least that much. Move the controls and this
// test recomputes and fails, which is exactly the coupling that was missing.

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
const REM_PX = 16;
const unitToPx = (units: number) => units * 4;

/**
 * Heights of the two control stacks, from their own markup:
 *  - the zoom ControlGroup is two `size-8` (32px) ControlButtons inside a
 *    1px-bordered rounded box -> 32*2 + 2 = 66px (matches the measured 633-699)
 *  - the doodle toggle is one `size-8` button in the same 1px-bordered box
 *    -> 32 + 2 = 34px (matches the measured 609-643)
 */
const ZOOM_GROUP_H = 32 * 2 + 2;
const DOODLE_GROUP_H = 32 + 2;

/** `bottom-N` offset of the map primitive's default bottom-right controls. */
const zoomBottomPx = (() => {
  const m = mapPrimitive.match(/"bottom-right":\s*"bottom-(\d+)\s+right-\d+"/);
  if (m?.[1] === undefined) {
    throw new Error(
      'Could not locate positionClasses["bottom-right"] in ui/map.tsx',
    );
  }
  return unitToPx(Number(m[1]));
})();

/** `bottom-N` offset of InteractiveMap's doodle toggle. */
const doodleBottomPx = (() => {
  const m = interactiveMap.match(/"absolute z-10 bottom-(\d+) right-\d+ /);
  if (m?.[1] === undefined) {
    throw new Error(
      "Could not locate the doodle toggle's position classes in InteractiveMap.tsx",
    );
  }
  return unitToPx(Number(m[1]));
})();

/**
 * The topmost pixel the bottom-right cluster can reach, measured up from the
 * map's bottom edge. The doodle toggle is conditional (`doodleSurface`), so the
 * worst case is the taller of the two reaches.
 */
const clusterTopPx = Math.max(
  zoomBottomPx + ZOOM_GROUP_H,
  doodleBottomPx + DOODLE_GROUP_H,
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

const columnBottomPx = (() => {
  const m = columnClass.match(/(?:^|\s)bottom-(\d+)(?:\s|")/);
  if (m?.[1] === undefined) {
    throw new Error("MapTopRightColumn no longer declares a `bottom-N` anchor");
  }
  return unitToPx(Number(m[1]));
})();

/** The `max-h-[calc(100%-Xrem)]` reserve, in px. */
const maxHReservePx = (() => {
  const m = columnClass.match(/max-h-\[calc\(100%-([\d.]+)rem\)\]/);
  if (m?.[1] === undefined) {
    throw new Error("MapTopRightColumn no longer declares a max-h calc clamp");
  }
  return Number(m[1]) * REM_PX;
})();

/** `top-3` — the column's top inset at >= lg, and its top gap below lg. */
const TOP_INSET_PX = unitToPx(3);

describe("map right-hand overlay column vs bottom-right controls", () => {
  it("derives the control cluster's reach from the controls' own classes", () => {
    // Guards the derivation itself: if these drift, every number below is
    // recomputed rather than silently stale.
    expect(zoomBottomPx).toBe(40); // bottom-10
    expect(doodleBottomPx).toBe(96); // bottom-24
    expect(clusterTopPx).toBe(130); // max(40+66, 96+34)
  });

  it("bottom-anchors BELOW lg above the cluster's topmost pixel", () => {
    // This is the case browser QA confirmed broken at 768x1024 and 393x852:
    // the column was `bottom-3` (12px), far inside the 130px cluster band.
    expect(columnBottomPx).toBeGreaterThanOrEqual(clusterTopPx);
    expect(columnBottomPx).toBe(144); // bottom-36 = 9rem
  });

  it("caps its height so it cannot reach the cluster at >= lg either", () => {
    // The >= lg case: top-anchored at `top-3`, the column grows DOWNWARD, so
    // only a max-height can stop a charts-ON column from reaching the
    // controls. Its lowest possible edge is top inset + max height.
    const lowestEdgeFromBottom = maxHReservePx - TOP_INSET_PX;
    expect(lowestEdgeFromBottom).toBeGreaterThanOrEqual(clusterTopPx);
    expect(maxHReservePx).toBe(156); // 9.75rem = top-3 (12) + 144 reserve
  });

  it("reserves the SAME band in both anchoring modes", () => {
    // One unprefixed clamp covers both breakpoints because they are mirror
    // images — below lg it bounds the upward growth, at >= lg the downward
    // growth. Keeping them equal is what makes the fix breakpoint-independent.
    expect(maxHReservePx - TOP_INSET_PX).toBe(columnBottomPx);
  });

  it("keeps a non-zero clearance band between the column and the controls", () => {
    // Not merely touching: there is real space between them at every viewport.
    expect(columnBottomPx - clusterTopPx).toBeGreaterThan(0);
    expect(columnBottomPx - clusterTopPx).toBe(14);
  });

  it("does not try to win the collision with z-index", () => {
    // The controls are z-10 and this column z-20. Painting above them was
    // never the problem — hit-testing was. If someone "fixes" a future
    // regression by raising z-index instead of reserving space, the controls
    // go back to being visible-but-dead, so pin the layering as-is.
    expect(columnClass).toContain("z-20");
    expect(interactiveMap).toContain("absolute z-10 bottom-24 right-2");
    expect(mapPrimitive).toContain('"absolute z-10 flex flex-col gap-1.5"');
  });

  it("leaves the approved >= lg top alignment untouched", () => {
    // Browser QA signed off CHARTS top-aligned with MAP CONTROLS at 0px delta.
    // The clearance work must not move the top edge — only bound the height.
    expect(columnClass).toContain("lg:top-3");
    expect(columnClass).toContain("lg:bottom-auto");
    expect(columnClass).toContain("right-3");
  });
});
