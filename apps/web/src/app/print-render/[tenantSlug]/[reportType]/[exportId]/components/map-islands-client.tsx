"use client";

/**
 * Thin client wrapper that defers Leaflet map island loading to the browser.
 *
 * Both EventPointsMap and PatrolTracksMap import leaflet/dist/leaflet.css and
 * react-leaflet which access `window` at module initialisation time. That
 * causes a ReferenceError when Next.js SSR-evaluates the server bundle.
 * Wrapping with `dynamic({ ssr: false })` prevents the Leaflet modules from
 * being required on the server; they are loaded only after the browser has
 * evaluated the page JS, which is exactly when Puppeteer executes client code
 * before checking window.__renderReady.
 *
 * RSC consumers (report-map-report.tsx) import from this file instead of the
 * raw island files. The API is identical so the call-sites are unchanged.
 */

import dynamic from "next/dynamic";
import type {
  ReportMapBounds,
  ReportMapEventPoint,
  ReportMapTrackRow,
} from "@/server/report-map-report/get-report-map-report-data";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";

const EventPointsMapDynamic = dynamic(
  () =>
    import("./event-points-map").then((mod) => ({ default: mod.EventPointsMap })),
  { ssr: false },
);

const PatrolTracksMapDynamic = dynamic(
  () =>
    import("./patrol-tracks-map").then((mod) => ({
      default: mod.PatrolTracksMap,
    })),
  { ssr: false },
);

// Patrol Tracks Heatmap island (R5, 2026-07-06) — same ssr:false rationale
// as the other two islands above (leaflet/react-leaflet touch `window` at
// module init).
const PatrolHeatmapMapDynamic = dynamic(
  () =>
    import("./patrol-heatmap-map").then((mod) => ({
      default: mod.PatrolHeatmapMap,
    })),
  { ssr: false },
);

// Event-density heatmap island (owner 2026-07-12) — same ssr:false rationale.
const EventHeatmapMapDynamic = dynamic(
  () =>
    import("./event-heatmap-map").then((mod) => ({
      default: mod.EventHeatmapMap,
    })),
  { ssr: false },
);

interface EventPointsMapProps {
  points: ReportMapEventPoint[];
  markerColor?: string;
  municipalityBounds?: ReportMapBounds | null;
}

interface PatrolTracksMapProps {
  tracks: ReportMapTrackRow[];
  municipalityBounds?: ReportMapBounds | null;
}

interface PatrolHeatmapMapProps {
  seaborne: HeatLatLng[];
  foot: HeatLatLng[];
  municipalityBounds?: ReportMapBounds | null;
}

interface EventHeatmapMapProps {
  points: ReportMapEventPoint[];
  municipalityBounds?: ReportMapBounds | null;
}

export function EventPointsMap(props: EventPointsMapProps) {
  return <EventPointsMapDynamic {...props} />;
}

export function PatrolTracksMap(props: PatrolTracksMapProps) {
  return <PatrolTracksMapDynamic {...props} />;
}

export function PatrolHeatmapMap(props: PatrolHeatmapMapProps) {
  return <PatrolHeatmapMapDynamic {...props} />;
}

export function EventHeatmapMap(props: EventHeatmapMapProps) {
  return <EventHeatmapMapDynamic {...props} />;
}
