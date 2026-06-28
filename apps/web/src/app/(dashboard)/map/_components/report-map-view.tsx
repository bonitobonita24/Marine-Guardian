"use client";

import { useCallback, useRef, useState } from "react";
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

function ReportMapInner() {
  const { from, to, municipalityId } = useReportFilter();
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
  };

  const breakdown = trpc.reportMap.eventBreakdown.useQuery(filter);
  const eventsOverTime = trpc.reportMap.eventsOverTime.useQuery(filter);
  const highPriority = trpc.reportMap.highPriorityEvents.useQuery(filter);

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
          trackMode="inRange"
          hidePatrolSelector
          hideSubjects
          controlsPlacement="floating"
          filterSlot={<ReportFilterBar layout="stacked" />}
          onEventClick={setSelectedEventId}
          focusLocation={focusLocation}
        />
      </div>

      {/* Analytics band — full-width, compact. One row on wide displays, wraps
          down on smaller screens. All range + municipality bound. */}
      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <BreakdownBars
          title="Law Enforcement and Apprehensions"
          variant="law_enforcement"
          data={breakdown.data?.lawEnforcement ?? []}
          compact
        />
        <BreakdownBars
          title="Monitoring, Patrolling and Surveillance"
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
