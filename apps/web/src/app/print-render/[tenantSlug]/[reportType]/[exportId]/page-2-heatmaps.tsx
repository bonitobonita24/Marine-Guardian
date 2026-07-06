/**
 * Per Area Report — Page 2 (Event + Patrol Track Heatmaps).
 *
 * RSC composer for v2 PRODUCT.md L135-L137. Layout:
 *
 *   [Section header — Heatmaps for {area} — {dateRange}]
 *   [Map: full width, ~110mm tall — both heat layers overlaid]
 *   [Dual gradient legend rendered server-side as static SVG bars
 *    to avoid hydration drift — events (red) on left, tracks (blue) on right]
 *   [Caveat footer — methodology note]
 *
 * Map is a client island (PerAreaHeatmapMap). Section frame + legend +
 * footer are RSC. CSS `page-break-before: always` on the wrapping section
 * forces Page 2 to start on a new physical page.
 *
 * Decision lock: leaflet.heat plugin + ~250m track densification per
 * DECISIONS_LOG.md "Heatmap Renderer Choice (Phase 8 Batch 6 Sub-batch 6.2b)".
 * Server pre-aggregates event point geometries and pre-densifies patrol
 * tracks; the client island never re-runs the sampler.
 */

import type {
  PerAreaReportArea,
  PerAreaReportDateRange,
  PerAreaReportEventLocation,
  PerAreaReportPatrolTrack,
} from "@/server/per-area-report/get-per-area-report-data";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";
import { PerAreaHeatmapMap } from "./components/per-area-heatmap-map";
import { ReportHeader } from "./components/report-header";

interface Page2HeatmapsProps {
  area: PerAreaReportArea;
  dateRange: PerAreaReportDateRange;
  lawEnforcementEventLocations: PerAreaReportEventLocation[];
  monitoringEventLocations: PerAreaReportEventLocation[];
  patrolTracks: PerAreaReportPatrolTrack[];
}

const EVENT_DEFAULT_WEIGHT = 1;

/**
 * Flatten event locations into HeatLatLng tuples. Both law enforcement and
 * monitoring events render on the same red gradient — they share a single
 * "events" visual category on the map (the bar charts on Page 1 already
 * surface the law-enforcement-vs-monitoring split).
 */
function eventsToHeatTuples(
  events: PerAreaReportEventLocation[],
): HeatLatLng[] {
  return events.map((e) => [e.lat, e.lon, EVENT_DEFAULT_WEIGHT] as HeatLatLng);
}

/**
 * Concat all per-patrol sampled point arrays into one big HeatLatLng[].
 * Each patrol's points are already at [lat, lon, weight] convention from
 * the server-side sampler.
 */
function tracksToHeatTuples(
  tracks: PerAreaReportPatrolTrack[],
): HeatLatLng[] {
  const out: HeatLatLng[] = [];
  for (const t of tracks) {
    for (const p of t.sampledPoints) {
      out.push(p);
    }
  }
  return out;
}

interface LegendGradientBarProps {
  label: string;
  colors: string[];
  testId: string;
}

function LegendGradientBar({ label, colors, testId }: LegendGradientBarProps) {
  const gradient = `linear-gradient(to right, ${colors.join(", ")})`;
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        minWidth: "180px",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          fontWeight: 600,
          color: "#374151",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: "8px",
          width: "100%",
          background: gradient,
          border: "1px solid #d1d5db",
          borderRadius: "2px",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "8px",
          color: "#6b7280",
        }}
      >
        <span>Lower density</span>
        <span>Higher density</span>
      </div>
    </div>
  );
}

const EVENT_GRADIENT_COLORS = [
  "#fecaca",
  "#fca5a5",
  "#f87171",
  "#ef4444",
  "#dc2626",
];

const TRACK_GRADIENT_COLORS = [
  "#bfdbfe",
  "#93c5fd",
  "#60a5fa",
  "#3b82f6",
  "#1d4ed8",
];

export function Page2Heatmaps({
  area,
  dateRange,
  lawEnforcementEventLocations,
  monitoringEventLocations,
  patrolTracks,
}: Page2HeatmapsProps) {
  const eventPoints: HeatLatLng[] = [
    ...eventsToHeatTuples(lawEnforcementEventLocations),
    ...eventsToHeatTuples(monitoringEventLocations),
  ];
  const trackPoints: HeatLatLng[] = tracksToHeatTuples(patrolTracks);
  const hasAnyData = eventPoints.length > 0 || trackPoints.length > 0;

  return (
    <section
      className="page-2-heatmaps"
      data-testid="page-2-heatmaps"
      style={{ pageBreakBefore: "always", paddingTop: "8px" }}
    >
      <ReportHeader
        municipalityName={area.name}
        reportTitle="Heatmaps"
        dateRange={dateRange.label}
      />

      <div
        className="map-container"
        data-testid="heatmap-container"
        style={{
          width: "100%",
          height: "110mm",
          border: "1px solid #e5e7eb",
          background: "#dbeafe",
          marginBottom: "10px",
          overflow: "hidden",
        }}
      >
        {hasAnyData ? (
          <PerAreaHeatmapMap
            eventPoints={eventPoints}
            trackPoints={trackPoints}
          />
        ) : (
          <div
            data-testid="heatmap-empty"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontStyle: "italic",
              color: "#6b7280",
              fontSize: "11px",
            }}
          >
            No event locations or patrol tracks to display.
          </div>
        )}
      </div>

      <div
        className="legend-row"
        data-testid="heatmap-legend"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          padding: "8px 10px",
          border: "1px solid #e5e7eb",
          borderRadius: "4px",
          background: "#fafafa",
          marginBottom: "8px",
        }}
      >
        <LegendGradientBar
          label="Events (Law Enforcement + Monitoring)"
          colors={EVENT_GRADIENT_COLORS}
          testId="legend-events"
        />
        <LegendGradientBar
          label="Patrol Tracks"
          colors={TRACK_GRADIENT_COLORS}
          testId="legend-tracks"
        />
      </div>

      <div
        data-testid="heatmap-methodology"
        style={{
          fontSize: "9px",
          color: "#6b7280",
          lineHeight: 1.4,
          padding: "6px 8px",
          background: "#f9fafb",
          border: "1px dashed #d1d5db",
          borderRadius: "3px",
        }}
      >
        <strong style={{ color: "#374151" }}>How density is calculated:</strong>{" "}
        Event points use raw recorded coordinates. Patrol tracks are densified
        to evenly-spaced samples every ~250 m along the great-circle arc length
        before rendering. Higher-density regions on the map indicate more events
        recorded or more patrol time spent in that area during the report range.
      </div>
    </section>
  );
}
