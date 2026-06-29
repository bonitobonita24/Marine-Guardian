"use client";

import { useCallback, useRef, useState } from "react";
import { ShieldAlert, Binoculars } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { InteractiveMap } from "@/components/map/InteractiveMap";
import { EventDetailModal } from "@/components/events/event-detail-modal";
import {
  ReportFilterProvider,
  useReportFilter,
} from "@/components/reporting/report-filter-context";
import { ReportFilterBar } from "@/components/reporting/report-filter-bar";
import { BreakdownBars } from "@/app/(dashboard)/dashboard/_components/breakdown-bars";
import { HighPriorityEventsCard } from "./high-priority-events-card";
import { EventsOverTimeChart } from "@/components/reporting/events-over-time-chart";
import {
  ReportMapEmptyState,
  shouldShowReportMapEmptyState,
} from "./report-map-empty-state";

/**
 * Interactive Report Map (2026-06-27) — a presentation surface for reporting to
 * the Mayor / investors. The shared {from,to,municipalityId} filter (provider)
 * scopes every panel in lock-step: the map markers + patrol tracks, the category
 * breakdown, the high-priority events list, and the events-over-time line. The
 * dashboard breakdown chart is reused in-place (pure presentational). (The top
 * KPI strip was removed 2026-06-28; the Municipality Coverage chart was replaced
 * 2026-06-28 with the High Priority Events list per owner request.)
 */

function rangeLabel(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

/**
 * Same month/day formatting as {@link rangeLabel}, but with the year on the end
 * bound — used in the empty-state message where the absolute date matters to a
 * stakeholder reading it out of context (e.g. "Jun 22 – Jun 29, 2026").
 */
function rangeLabelWithYear(from: Date, to: Date): string {
  const short = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const long = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${short(from)} – ${long(to)}`;
}

function ReportMapInner() {
  const { from, to, municipalityId, protectedZoneId } = useReportFilter();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // "Locate on map" from the High Priority Events list: fly the map to the
  // event's coordinate (key bumps each click to re-trigger) AND scroll the map
  // back into view since the list sits below it in the scroll column.
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const focusKeyRef = useRef(0);
  const [focusLocation, setFocusLocation] = useState<{
    lon: number;
    lat: number;
    key: number;
  } | null>(null);
  const locateOnMap = useCallback((lat: number, lon: number) => {
    focusKeyRef.current += 1;
    setFocusLocation({ lat, lon, key: focusKeyRef.current });
    mapWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const filter = {
    from,
    to,
    ...(municipalityId !== null ? { municipalityId } : {}),
    ...(protectedZoneId !== null ? { protectedZoneId } : {}),
  };

  const breakdown = trpc.reportMap.eventBreakdown.useQuery(filter);
  const eventsOverTime = trpc.reportMap.eventsOverTime.useQuery(filter);
  const highPriority = trpc.reportMap.highPriorityEvents.useQuery(filter);

  // Municipality NAME for the empty-state message — derived from the same
  // dropdown options the filter bar renders (cached query, no extra fetch).
  const municipalities = trpc.municipality.list.useQuery();
  const municipalityName =
    municipalityId === null
      ? null
      : (municipalities.data?.find((m) => m.id === municipalityId)?.name ??
        null);

  // Total events in the active range — the continuous daily series sums to the
  // same total as the full event count (the where-clause already bounds events
  // to [from,to], so every matched event lands in a bucket). Used purely to
  // decide whether to show the "no events" empty state.
  const totalEvents = (eventsOverTime.data ?? []).reduce(
    (sum, d) => sum + d.count,
    0,
  );

  const showEmptyState = shouldShowReportMapEmptyState({
    municipalityId,
    totalEvents,
    isLoading: eventsOverTime.isLoading,
    municipalityName,
  });

  const label = rangeLabel(from, to);

  return (
    <div className="command-center flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
      {/* Slim header band — title only. The shared FROM/TO/municipality filter
          now lives inside the floating map-controls card (passed as filterSlot
          below) so the map gets the reclaimed height. */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Interactive Report Map</h1>
      </div>

      {/* Map — grows to fill the viewport (fits one screen on a wide display;
          the whole column scrolls cleanly if the window is small). */}
      <div
        ref={mapWrapRef}
        className="cc-gridbg relative min-h-[22rem] flex-1 overflow-hidden rounded-xl border border-[hsl(var(--panel-border))]"
      >
        <InteractiveMap
          className="relative z-10 h-full w-full"
          dateFrom={from}
          dateTo={to}
          {...(municipalityId !== null ? { municipalityId } : {})}
          {...(protectedZoneId !== null ? { protectedZoneId } : {})}
          trackMode="inRange"
          defaultEventLayers={{ lawEnforcement: true, monitoring: true }}
          hidePatrolSelector
          hideSubjects
          controlsPlacement="floating"
          filterSlot={<ReportFilterBar layout="stacked" />}
          onEventClick={setSelectedEventId}
          focusLocation={focusLocation}
        />
      </div>

      {/* Analytics band — full-width, compact. One row on wide displays, wraps
          down on smaller screens. All range + municipality bound. When a
          specific municipality genuinely has zero events in range, the band of
          "0" cards reads like a malfunction, so we replace it with an explicit
          empty-state message naming the municipality + range (the data is
          correct — there simply were no events). */}
      {showEmptyState && municipalityName !== null ? (
        <div className="shrink-0">
          <ReportMapEmptyState
            municipalityName={municipalityName}
            rangeLabel={rangeLabelWithYear(from, to)}
          />
        </div>
      ) : (
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <BreakdownBars
            title="Law Enforcement and Apprehensions"
            titleIcon={ShieldAlert}
            variant="law_enforcement"
            data={breakdown.data?.lawEnforcement ?? []}
            compact
          />
          <BreakdownBars
            title="Monitoring, Patrolling and Surveillance"
            titleIcon={Binoculars}
            variant="monitoring"
            data={breakdown.data?.monitoring ?? []}
            compact
          />
          <HighPriorityEventsCard
            events={highPriority.data?.events ?? []}
            total={highPriority.data?.total ?? 0}
            isLoading={highPriority.isLoading}
            onSelect={setSelectedEventId}
            onLocate={locateOnMap}
          />
          <EventsOverTimeChart
            data={eventsOverTime.data ?? []}
            isLoading={eventsOverTime.isLoading}
            rangeLabel={label}
            compact
          />
        </div>
      )}

      <EventDetailModal
        eventId={selectedEventId}
        onClose={() => {
          setSelectedEventId(null);
        }}
      />
    </div>
  );
}

export function ReportMapView() {
  return (
    <ReportFilterProvider>
      <ReportMapInner />
    </ReportFilterProvider>
  );
}
