// event-points-map-municipality-framing.test.tsx
//
// Regression test for R11: a single-municipality Report Map PDF failed to
// zoom its Leaflet maps to the municipality even though `municipalityBounds`
// reached each island correctly and `applyFraming`'s `fitBounds` call ran
// with the right bounds (event-points-map.tsx / patrol-tracks-map.tsx /
// patrol-heatmap-map.tsx — all three call the same shape of `fitBounds`).
//
// ROOT CAUSE (found via this exact repro): `map.fitBounds(bounds, {
// padding, maxZoom })` with NO `animate` option lets Leaflet take its
// DEFAULT animated (~250ms CSS-transition) pan path whenever the recenter
// offset fits within the viewport (leaflet-src.js `_tryAnimatedPan` /
// `panBy`'s `options.animate !== false` branch runs `PosAnimation.run(...)`
// instead of the synchronous `_rawPanBy`). Leaflet only applies the final
// center to its internal state (and to `map.getCenter()`) once that
// transition's `transitionend`-driven callback fires. `MapRenderGate`
// (../components/map-render-gate.tsx) never waits for this pan animation —
// it only waits for the TileLayer's own "load" event (or flips immediately
// when there's no overlay) — so Puppeteer's `page.pdf()` can capture the
// page before the pan has taken visual/state effect, showing the map still
// at the MapContainer's hardcoded default view (center=[13.0,121.0],
// zoom=9), exactly matching the reported symptom.
//
// THE FIX: add `animate: false` to every `fitBounds` call in the three
// island components. This forces Leaflet's `panBy` down its synchronous
// `_rawPanBy` + immediate `fire('move').fire('moveend')` path — matching the
// same `animate: false` already used by MapRenderGate's own
// `invalidateSize({ animate: false })` call immediately before `applyFraming`
// runs — so the municipality-framed view is fully applied before
// MapRenderGate's effect returns, with nothing async left for Puppeteer's
// synchronous capture to race against.
//
// This test proves the underlying Leaflet contract the fix depends on by
// mounting a REAL MapContainer + TileLayer + probe component (not mocked)
// under `@vitest-environment jsdom`, issuing the SAME two fitBounds call
// shapes the app uses (with and without `animate: false`), and asserting
// `map.getCenter()` only reflects the requested bounds' centroid — rather
// than staying at the MapContainer default — in the `animate: false` case.
// jsdom has no real layout/animation engine, so this is precisely the
// environment that reproduces the race (a real browser's CSS transition
// would eventually complete; jsdom's never does), making it a faithful
// regression guard against a future edit that drops `animate: false`.

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

// Municipality bounds fixture — mirrors the confirmed real value for Abra de
// Ilog (municipalityId cmqryjszj002sgmdxpc7ntgmu) from
// get-report-map-report-data.ts's unionGeometryBounds.
const BOUNDS: [[number, number], [number, number]] = [
  [13.142, 120.443],
  [13.637, 121.027],
];
const EXPECTED_CENTER = { lat: (13.142 + 13.637) / 2, lng: (120.443 + 121.027) / 2 };
const DEFAULT_CENTER = { lat: 13.0, lng: 121.0 };

// jsdom has no layout engine — every element reports 0x0 by default, which
// would make fitBounds legitimately no-op for the wrong reason. Stub a fixed
// size matching the print report's `.section-map` box (see
// report-map-report.tsx's `mapHeightPx`/patrol layout) so the assertions
// exercise the real recenter/zoom math, not a degenerate zero-size case.
function stubElementSize(width: number, height: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return width;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return height;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON() {},
      };
    },
  });
}

function Probe({
  animate,
  onResult,
}: {
  animate: boolean | undefined;
  onResult: (map: LeafletMap) => void;
}) {
  const map = useMap();
  useEffect(() => {
    // Mirrors MapRenderGate's own sequencing (invalidateSize before
    // fitBounds) so this probe exercises the exact same call order the
    // production islands run through.
    map.invalidateSize({ animate: false });
    const options: { padding: [number, number]; maxZoom: number; animate?: boolean } = {
      padding: [8, 8],
      maxZoom: 15,
    };
    if (animate !== undefined) options.animate = animate;
    map.fitBounds(BOUNDS, options);
    onResult(map);
  }, [map, animate, onResult]);
  return null;
}

function mountAndFit(
  container: HTMLDivElement,
  root: Root,
  animate: boolean | undefined,
): LeafletMap {
  let captured: LeafletMap | undefined;
  act(() => {
    root.render(
      <MapContainer
        center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
        zoom={9}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Probe
          animate={animate}
          onResult={(map) => {
            captured = map;
          }}
        />
      </MapContainer>,
    );
  });
  if (!captured) throw new Error("probe did not capture a map instance");
  return captured;
}

describe("Report Map island fitBounds — animate:false regression (R11)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    stubElementSize(450, 370);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("BUG REPRO: without animate:false, fitBounds leaves the map at its MapContainer default center", () => {
    const map = mountAndFit(container, root, undefined);
    // This is the exact bug: fitBounds was called with the right bounds, but
    // Leaflet's animated pan never completed within this synchronous test
    // flush (jsdom never fires the CSS transitionend that would apply it),
    // so getCenter() is still (approximately) the MapContainer default —
    // matching what Puppeteer captured in the real PDF.
    const center = map.getCenter();
    expect(Math.abs(center.lat - DEFAULT_CENTER.lat)).toBeLessThan(0.05);
    expect(Math.abs(center.lat - EXPECTED_CENTER.lat)).toBeGreaterThan(0.1);
  });

  it("FIX: with animate:false (as event/tracks/heatmap islands now pass), fitBounds recenters synchronously on the municipality bounds' centroid", () => {
    const map = mountAndFit(container, root, false);
    const center = map.getCenter();
    expect(Math.abs(center.lat - EXPECTED_CENTER.lat)).toBeLessThan(0.01);
    expect(Math.abs(center.lng - EXPECTED_CENTER.lng)).toBeLessThan(0.01);
  });
});
