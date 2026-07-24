// Placement guard for the map's zoom + doodle control cluster
// (owner request 2026-07-20).
//
// The cluster used to sit in the map's bottom-right corner. On the Interactive
// Report Map (`controlsPlacement="floating"`) it now sits immediately to the
// RIGHT of the upper-LEFT "MAP CONTROLS" card, top-aligned with it, with a
// ~12px gap — and INDEPENDENT of it, so collapsing MAP CONTROLS does not move
// the controls.
//
// Two things this must keep honest:
//   1. The offset TRACKS the MAP CONTROLS card's width at every breakpoint.
//      The card is `w-48` (12rem) below `lg` and `w-64` (16rem) at `lg`+, so a
//      single fixed offset would leave a ~60px hole on narrow viewports.
//      Both offsets are therefore RE-DERIVED here from the card's own width
//      classes rather than hardcoded — change the card and this recomputes and
//      fails, which is exactly the coupling that must not be lost.
//   2. Other consumers of the shared `ui/map.tsx` primitive (SingleEventMap,
//      and InteractiveMap's own bar mode) must be untouched: the preset
//      corner anchors still apply when no `positionClassName` is passed.
//
// Why a source-level test: InteractiveMap boots maplibre-gl (WebGL) and cannot
// render in jsdom, and jsdom evaluates no Tailwind CSS and runs no layout
// engine, so computed geometry is unavailable here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, ...p), 'utf8');

const interactiveMap = read('..', 'InteractiveMap.tsx');
const mapPrimitive = read('..', '..', 'ui', 'map.tsx');
const singleEventMap = read('..', 'SingleEventMap.tsx');

/** Tailwind spacing scale: 1 unit = 0.25rem. */
const unitToRem = (units: number) => units * 0.25;

/** The MAP CONTROLS card's own className literal. */
const leftColumnClass = (() => {
  const m = interactiveMap.match(/"absolute left-3 top-3 z-20 flex[^"]*"/);
  if (m === null) {
    throw new Error('Could not locate the MAP CONTROLS column className in InteractiveMap.tsx');
  }
  return m[0];
})();

/** Parse a `w-N` / `lg:w-N` width off the card, in rem. */
const cardWidthRem = (prefix: '' | 'lg:') => {
  const m = leftColumnClass.match(new RegExp(`(?:^|\\s)${prefix}w-(\\d+)(?:\\s|")`));
  if (m?.[1] === undefined) {
    throw new Error(`MAP CONTROLS no longer declares a \`${prefix}w-N\` width`);
  }
  return unitToRem(Number(m[1]));
};

/** The card's left inset, which doubles as the gap we leave beside it. */
const CARD_LEFT_REM = unitToRem(3); // left-3
const GAP_REM = unitToRem(3); // 12px, mirroring the card's own gutter

/** Expected cluster offset = card left inset + card width + gap. */
const expectedOffsetRem = (prefix: '' | 'lg:') => CARD_LEFT_REM + cardWidthRem(prefix) + GAP_REM;

const clusterClass = (() => {
  const m = interactiveMap.match(/const CONTROL_CLUSTER_BESIDE_MAP_CONTROLS =\s*"([^"]*)"/);
  if (m?.[1] === undefined) {
    throw new Error('CONTROL_CLUSTER_BESIDE_MAP_CONTROLS is gone');
  }
  return m[1];
})();

const doodleClass = (() => {
  const m = interactiveMap.match(/const DOODLE_TOGGLE_BESIDE_MAP_CONTROLS =\s*"([^"]*)"/);
  if (m?.[1] === undefined) {
    throw new Error('DOODLE_TOGGLE_BESIDE_MAP_CONTROLS is gone');
  }
  return m[1];
})();

describe('floating map control cluster — placed beside MAP CONTROLS', () => {
  it("derives the offsets from the MAP CONTROLS card's own widths", () => {
    // Guards the derivation itself: if the card's widths drift, the expected
    // offsets below recompute rather than going silently stale.
    expect(cardWidthRem('')).toBe(12); // w-48
    expect(cardWidthRem('lg:')).toBe(16); // lg:w-64
    expect(expectedOffsetRem('')).toBe(13.5); // 216px
    expect(expectedOffsetRem('lg:')).toBe(17.5); // 280px
  });

  it('sits one gap to the right of the card at every breakpoint', () => {
    expect(clusterClass).toContain(`left-[${expectedOffsetRem('').toString()}rem]`);
    expect(clusterClass).toContain(`lg:left-[${expectedOffsetRem('lg:').toString()}rem]`);
  });

  it('top-aligns with the card and never anchors to the bottom-right', () => {
    expect(clusterClass).toContain('top-3');
    expect(clusterClass).not.toMatch(/(^|\s)right-/);
    expect(clusterClass).not.toMatch(/(^|\s)bottom-/);
  });

  it('stacks the doodle toggle in the same column, below the zoom group', () => {
    // Same left offsets — the two must move together.
    expect(doodleClass).toContain(`left-[${expectedOffsetRem('').toString()}rem]`);
    expect(doodleClass).toContain(`lg:left-[${expectedOffsetRem('lg:').toString()}rem]`);
    // Below the zoom group, not beside/under the map's corner.
    expect(doodleClass).toContain('top-[5.3125rem]');
    expect(doodleClass).not.toMatch(/(^|\s)right-/);
  });

  it('is INDEPENDENT of the card, not docked to it', () => {
    // Absolute insets on the MAP, so the card's collapse state cannot move
    // them. If these ever became DOM children of the card, this fails.
    expect(clusterClass).not.toContain('relative');
    expect(leftColumnClass).not.toContain('flex-row');
  });

  it('only applies in floating mode; bar mode keeps the corner slot', () => {
    expect(interactiveMap).toContain('positionClassName: CONTROL_CLUSTER_BESIDE_MAP_CONTROLS');
    // The doodle toggle's non-floating branch still uses the old corner slot.
    expect(interactiveMap).toContain('"bottom-24 right-2"');
  });
});

describe('ui/map.tsx MapControls — other consumers unaffected', () => {
  it('keeps the bottom-right preset as the default', () => {
    expect(mapPrimitive).toContain('"bottom-right": "bottom-10 right-2"');
    expect(mapPrimitive).toContain('position = "bottom-right"');
  });

  it('only overrides the preset when positionClassName is supplied', () => {
    expect(mapPrimitive).toMatch(/positionClassName !== undefined && positionClassName !== ""/);
    expect(mapPrimitive).toContain('positionClasses[position]');
  });

  it('SingleEventMap passes no positionClassName', () => {
    expect(singleEventMap).toContain('<MapControls showZoom />');
    expect(singleEventMap).not.toContain('positionClassName');
  });
});
