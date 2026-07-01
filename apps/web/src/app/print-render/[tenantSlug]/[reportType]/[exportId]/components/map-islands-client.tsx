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
import type { ReportMapEventPoint, ReportMapTrackRow } from "@/server/report-map-report/get-report-map-report-data";

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

interface EventPointsMapProps {
  points: ReportMapEventPoint[];
  markerColor?: string;
}

interface PatrolTracksMapProps {
  tracks: ReportMapTrackRow[];
}

export function EventPointsMap(props: EventPointsMapProps) {
  return <EventPointsMapDynamic {...props} />;
}

export function PatrolTracksMap(props: PatrolTracksMapProps) {
  return <PatrolTracksMapDynamic {...props} />;
}
