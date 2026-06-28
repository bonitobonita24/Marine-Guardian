"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { InteractiveMap } from "@/components/map/InteractiveMap";
import { EventDetailModal } from "@/components/events/event-detail-modal";
import {
  ReportFilterProvider,
  useReportFilter,
} from "@/components/reporting/report-filter-context";
import { ReportFilterBar } from "@/components/reporting/report-filter-bar";
import { BreakdownBars } from "@/app/(dashboard)/dashboard/_components/breakdown-bars";
import { MunicipalityCoverageChart } from "@/app/(dashboard)/dashboard/_components/municipality-coverage-chart";
import { EventsOverTimeChart } from "@/components/reporting/events-over-time-chart";

/**
 * Interactive Report Map (2026-06-27) — a presentation surface for reporting to
 * the Mayor / investors. The shared {from,to,municipalityId} filter (provider)
 * scopes every panel in lock-step: the map markers + patrol tracks, the category
 * breakdown, the municipality-coverage chart, and the events-over-time line. The
 * existing dashboard breakdown + coverage charts are reused in-place (pure
 * presentational) — only the data source differs. (The top KPI strip was removed
 * 2026-06-28 — redundant with the breakdown card totals + coverage chart.)
 */

function rangeLabel(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

function ReportMapInner() {
  const { from, to, municipalityId } = useReportFilter();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const filter = {
    from,
    to,
    ...(municipalityId !== null ? { municipalityId } : {}),
  };

  const breakdown = trpc.reportMap.eventBreakdown.useQuery(filter);
  const eventsOverTime = trpc.reportMap.eventsOverTime.useQuery(filter);
  const coverage = trpc.municipalityCoverage.municipalityCoverage.useQuery({
    dateFrom: from,
    dateTo: to,
    ...(municipalityId !== null ? { municipalityId } : {}),
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
      <div className="cc-gridbg relative min-h-[22rem] flex-1 overflow-hidden rounded-xl border border-[hsl(var(--panel-border))]">
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
        />
      </div>

      {/* Analytics band — full-width, compact. One row on wide displays, wraps
          down on smaller screens. All range + municipality bound. */}
      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <BreakdownBars
          title="Law Enforcement"
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
        <MunicipalityCoverageChart
          data={coverage.data ?? []}
          isLoading={coverage.isLoading}
          rangeLabel={label}
          compact
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
