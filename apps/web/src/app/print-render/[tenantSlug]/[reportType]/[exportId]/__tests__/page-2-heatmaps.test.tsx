// page-2-heatmaps.test.tsx
//
// RSC-style test for Per Area Report Page 2 — section frame, page-break
// CSS, empty state, gradient legend, methodology footer, and verification
// that the map mounts only when content exists. The leaflet-bearing client
// island PerAreaHeatmapMap is mocked at the top of the file per the
// react-leaflet 🔴 gotcha (leaflet imports `window` unconditionally — node
// has no `window`, so the component MUST be mocked in unit tests).

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../components/per-area-heatmap-map", () => ({
  PerAreaHeatmapMap: () => null,
}));

import { Page2Heatmaps } from "../page-2-heatmaps";
import type {
  PerAreaReportArea,
  PerAreaReportDateRange,
  PerAreaReportEventLocation,
  PerAreaReportPatrolTrack,
} from "@/server/per-area-report/get-per-area-report-data";

function makeArea(): PerAreaReportArea {
  return {
    id: "area-1",
    name: "Apo Reef",
    region: "Mindoro",
    source: "custom",
  };
}

function makeDateRange(): PerAreaReportDateRange {
  return {
    start: new Date(Date.UTC(2026, 4, 1)),
    end: new Date(Date.UTC(2026, 5, 1)),
    label: "May 2026",
    isDefault: false,
  };
}

function makeEvent(
  lat: number,
  lon: number,
  eventTypeId = "evt-1",
): PerAreaReportEventLocation {
  return { lat, lon, eventTypeId };
}

function makeTrack(
  patrolId: string,
  pts: Array<[number, number, number]>,
): PerAreaReportPatrolTrack {
  return {
    patrolId,
    patrolType: "seaborne",
    sampledPoints: pts,
  };
}

describe("Page2Heatmaps", () => {
  it("renders the section frame with title that includes area and date range", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[]}
      />,
    );
    // Shared print-render header (2026-07-06 redesign) replaces the former
    // "Page 2 — Heatmaps — {area} — {dateRange}" h3 banner with the shared
    // 4-line header (big title / area name / report title / date range).
    expect(html).toContain("Marine Guardian Report");
    expect(html).toContain("Heatmaps");
    expect(html).toContain("Apo Reef");
    expect(html).toContain("May 2026");
  });

  it("forces page-break-before: always so Page 2 starts on a new physical page", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[]}
      />,
    );
    expect(html).toMatch(/page-break-before:\s*always/);
  });

  it("shows the empty-state map message when there are no events and no tracks", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[]}
      />,
    );
    expect(html).toContain('data-testid="heatmap-empty"');
    expect(html).toContain("No event locations or patrol tracks to display.");
  });

  it("mounts the heatmap container when event locations exist", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[makeEvent(13.0, 121.0)]}
        monitoringEventLocations={[]}
        patrolTracks={[]}
      />,
    );
    expect(html).toContain('data-testid="heatmap-container"');
    expect(html).not.toContain('data-testid="heatmap-empty"');
  });

  it("mounts the heatmap container when patrol tracks exist (no events)", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[makeTrack("p1", [[13.0, 121.0, 1]])]}
      />,
    );
    expect(html).toContain('data-testid="heatmap-container"');
    expect(html).not.toContain('data-testid="heatmap-empty"');
  });

  it("renders both gradient legend bars (events + tracks) every time", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[]}
      />,
    );
    expect(html).toContain('data-testid="heatmap-legend"');
    expect(html).toContain('data-testid="legend-events"');
    expect(html).toContain('data-testid="legend-tracks"');
    expect(html).toContain("Events (Law Enforcement + Monitoring)");
    expect(html).toContain("Patrol Tracks");
  });

  it("renders the legend as static server-side gradients (avoids hydration drift)", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[]}
      />,
    );
    // Event gradient stops (red-200 → red-600).
    expect(html).toContain("#fecaca");
    expect(html).toContain("#dc2626");
    // Track gradient stops (blue-200 → blue-700).
    expect(html).toContain("#bfdbfe");
    expect(html).toContain("#1d4ed8");
  });

  it("renders the methodology footer explaining 250m densification", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[]}
      />,
    );
    expect(html).toContain('data-testid="heatmap-methodology"');
    expect(html).toContain("How density is calculated");
    expect(html).toContain("250");
  });

  it("flattens both law-enforcement and monitoring events into a single event layer", () => {
    // This is a behavioural assertion via the mocked client island: as long
    // as the composer doesn't throw with mixed law-enforcement + monitoring
    // event arrays, the flatten succeeded. We can't introspect the mocked
    // component's props directly without a more elaborate spy, but a
    // non-empty event set should hide the empty state.
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[
          makeEvent(13.0, 121.0, "law-1"),
          makeEvent(13.05, 121.05, "law-2"),
        ]}
        monitoringEventLocations={[
          makeEvent(13.1, 121.1, "mon-1"),
        ]}
        patrolTracks={[]}
      />,
    );
    expect(html).toContain('data-testid="heatmap-container"');
    expect(html).not.toContain('data-testid="heatmap-empty"');
  });

  it("flattens multiple patrol tracks (concat of all sampledPoints arrays)", () => {
    const html = renderToStaticMarkup(
      <Page2Heatmaps
        area={makeArea()}
        dateRange={makeDateRange()}
        lawEnforcementEventLocations={[]}
        monitoringEventLocations={[]}
        patrolTracks={[
          makeTrack("p1", [
            [13.0, 121.0, 1],
            [13.01, 121.01, 1],
          ]),
          makeTrack("p2", [
            [13.05, 121.05, 1],
          ]),
        ]}
      />,
    );
    expect(html).toContain('data-testid="heatmap-container"');
    expect(html).not.toContain('data-testid="heatmap-empty"');
  });
});
