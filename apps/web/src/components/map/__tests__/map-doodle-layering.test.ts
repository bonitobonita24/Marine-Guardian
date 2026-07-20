// Stacking guard for doodle mode (QA defect 2026-07-20).
//
// CONFIRMED DEFECT: with doodle mode ON, `document.elementFromPoint()` at the
// centre of "Zoom in", "Zoom out" and "Exit doodle mode" returned the doodle
// CANVAS at both 1280x600 and 768x1024, and real clicks timed out. Cause: the
// canvas is `absolute inset-0` (full-bleed, so it covers every control) and it
// sat at `z-10` — the SAME layer as the zoom cluster and the doodle toggle.
// Equal z-index falls back to paint order, and the canvas paints last.
//
// Moving a control could never have fixed this: the obstruction covers the
// whole map. The fix is an explicit ordered stack (`../mapLayers.ts`), and
// this test pins it.
//
// Why a source-level test: InteractiveMap boots maplibre-gl (WebGL) and cannot
// render in jsdom, and jsdom evaluates no Tailwind CSS, so computed stacking
// is unavailable here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MAP_LAYER } from '../mapLayers';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, ...p), 'utf8');

const interactiveMap = read('..', 'InteractiveMap.tsx');
const doodleOverlay = read('..', 'doodle', 'DoodleOverlay.tsx');
const doodleToolbar = read('..', 'doodle', 'DoodleToolbar.tsx');
const mapPrimitive = read('..', '..', 'ui', 'map.tsx');

/** `z-30` -> 30. */
const zValue = (cls: string) => {
  const m = /^z-(\d+)$/.exec(cls);
  if (m?.[1] === undefined) {
    throw new Error(`MAP_LAYER entry "${cls}" is not a plain Tailwind z-N class`);
  }
  return Number(m[1]);
};

describe('map floating-layer scale', () => {
  it('orders the layers doodleCanvas < panel < control', () => {
    expect(zValue(MAP_LAYER.doodleCanvas)).toBeLessThan(zValue(MAP_LAYER.panel));
    expect(zValue(MAP_LAYER.panel)).toBeLessThan(zValue(MAP_LAYER.control));
  });

  it('keeps the layers distinct — equal z-index is what caused the defect', () => {
    const values = [
      zValue(MAP_LAYER.doodleCanvas),
      zValue(MAP_LAYER.panel),
      zValue(MAP_LAYER.control),
    ];
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('doodle canvas stays BELOW the interactive controls', () => {
  it('the full-bleed canvas is declared on the lowest layer', () => {
    // Full-bleed is the reason the layering matters — assert it is still so,
    // otherwise this guard silently stops covering the real case.
    expect(doodleOverlay).toMatch(/cn\("absolute inset-0", MAP_LAYER\.doodleCanvas\)/);
    expect(doodleOverlay).not.toMatch(/className="absolute inset-0 z-\d+"/);
  });

  it('the canvas keeps pointer events across its whole area while active', () => {
    // The fix must NOT be "shrink the canvas" or "disable its pointer events":
    // drawing has to keep working over the entire map surface.
    expect(doodleOverlay).toMatch(/pointerEvents: active \? "auto" : "none"/);
  });

  it('the zoom cluster is lifted onto the control layer', () => {
    expect(interactiveMap).toMatch(/<MapControls\s+className=\{MAP_LAYER\.control\}/);
    // The primitive's own default must still be overridable: className is
    // merged last by twMerge inside MapControls.
    expect(mapPrimitive).toMatch(/"absolute z-10 flex flex-col gap-1\.5"/);
    expect(mapPrimitive).toMatch(/positionClasses\[position\],\s*className,/);
  });

  it('the doodle toggle (the only way OUT of doodle mode) is on the control layer', () => {
    const toggleBlock = /border-border bg-background absolute flex flex-col overflow-hidden rounded-md border shadow-sm",\s*MAP_LAYER\.control,/;
    expect(interactiveMap).toMatch(toggleBlock);
    expect(interactiveMap).toMatch(/aria-label=\{doodle\.active \? "Exit doodle mode" : "Doodle on map"\}/);
  });

  it('the doodle toolbar sits on the panel layer, above the canvas', () => {
    expect(doodleToolbar).toMatch(/MAP_LAYER\.panel,/);
  });

  it('no map overlay re-introduces a bare z-10 that would tie with the canvas', () => {
    // The two clusters that regressed before must not go back to a literal.
    const controlLiterals = interactiveMap.match(/absolute z-10 flex flex-col overflow-hidden/g);
    expect(controlLiterals).toBeNull();
  });
});
