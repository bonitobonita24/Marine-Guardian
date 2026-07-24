// Narrow-viewport regression guard for the map's upper-LEFT floating "Map
// controls" column (fix 2026-07-20).
//
// The column is declared inside InteractiveMap, which cannot be rendered in
// jsdom (it boots maplibre-gl, which needs WebGL). Every other test that
// touches it therefore stubs the whole component out — which means no
// render-based test can see this column's real classes. So this asserts the
// class contract at the SOURCE level instead: crude, but it is the only place
// that can actually catch a regression here, and the string it guards is a
// single literal.
//
// What it guards: the left column and MapTopRightColumn were both hard `w-60`
// (240px) with only a trailing `max-w-[calc(100%-1.5rem)]` clamp, so as the map
// narrowed they collided — measured in a real browser at 870px clear (1600px
// viewport), 38px (768px), and -143px (393px, panels on identical coordinates).
// Below `lg` the column now steps down to `w-48` / `max-w-[60%]`; at `lg` and
// above the pre-regression values are restored verbatim.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "InteractiveMap.tsx"),
  "utf8",
);

/** The floating controls column's own className literal. */
const columnClass = (() => {
  const match = source.match(/"absolute left-3 top-3 z-20 flex[^"]*"/);
  if (match === null) {
    throw new Error(
      "Could not locate the floating controls column className in InteractiveMap.tsx",
    );
  }
  return match[0];
})();

describe("InteractiveMap floating controls column — responsive width", () => {
  it("keeps the approved wide-viewport width at lg and above", () => {
    // Signed off in-browser at 1600px: w-64, left-3 top-3, clamped to the map.
    expect(columnClass).toContain("lg:w-64");
    expect(columnClass).toContain("lg:max-w-[calc(100%-1.5rem)]");
    expect(columnClass).toContain("left-3");
    expect(columnClass).toContain("top-3");
  });

  it("steps down to a narrower width below lg", () => {
    expect(columnClass).toContain("w-48");
    expect(columnClass).toContain("max-w-[60%]");
  });

  it("no longer pins a bare w-60 at every viewport (the collision cause)", () => {
    // A bare `w-60` (no lg: prefix) is exactly what made this column and the
    // top-right column overlap below ~730px.
    expect(columnClass).not.toMatch(/(^|\s)w-60(\s|")/);
    // Likewise the unprefixed full-bleed clamp, which allowed the column to
    // span the entire narrow map.
    expect(columnClass).not.toMatch(/(^|\s)max-w-\[calc\(100%-1\.5rem\)\]/);
  });
});
