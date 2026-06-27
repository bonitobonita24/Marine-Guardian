"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
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
 * scopes every panel in lock-step: the map markers + patrol tracks, the KPI
 * tiles, the category breakdown, the municipality-coverage chart, and the
 * events-over-time line. The existing dashboard breakdown + coverage charts are
 * reused in-place (pure presentational) — only the data source differs.
 */

function rangeLabel(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="min-w-0 flex-1 border-border py-3">
      <CardContent className="px-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

function ReportMapInner() {
  const { from, to, municipalityId } = useReportFilter();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const filter = {
    from,
    to,
    ...(municipalityId !== null ? { municipalityId } : {}),
  };

  const summary = trpc.reportMap.summary.useQuery(filter);
  const breakdown = trpc.reportMap.eventBreakdown.useQuery(filter);
  const eventsOverTime = trpc.reportMap.eventsOverTime.useQuery(filter);
  const coverage = trpc.municipalityCoverage.municipalityCoverage.useQuery({
    dateFrom: from,
    dateTo: to,
    ...(municipalityId !== null ? { municipalityId } : {}),
  });

  const label = rangeLabel(from, to);
  const s = summary.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Interactive Report Map</h1>
      </div>

      <ReportFilterBar />

      {/* KPI tiles (panel 1 of 4) */}
      <div className="flex flex-wrap gap-2">
        <KpiTile label="Total Events" value={s?.totalEvents ?? 0} />
        <KpiTile label="Total Patrols" value={s?.totalPatrols ?? 0} />
        <KpiTile label="Law Enforcement" value={s?.lawEnforcementEvents ?? 0} />
        <KpiTile label="Monitoring" value={s?.monitoringEvents ?? 0} />
      </div>

      {/* Map */}
      <div className="h-[60vh] min-h-[24rem] overflow-hidden rounded-lg border">
        <InteractiveMap
          dateFrom={from}
          dateTo={to}
          {...(municipalityId !== null ? { municipalityId } : {})}
          trackMode="inRange"
          hidePatrolSelector
          onEventClick={setSelectedEventId}
        />
      </div>

      {/* Chart band (panels 2–4): category breakdown, municipality coverage,
          events over time. All range + municipality bound. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BreakdownBars
          title="Law Enforcement"
          variant="law_enforcement"
          data={breakdown.data?.lawEnforcement ?? []}
        />
        <BreakdownBars
          title="Monitoring"
          variant="monitoring"
          data={breakdown.data?.monitoring ?? []}
        />
        <MunicipalityCoverageChart
          data={coverage.data ?? []}
          isLoading={coverage.isLoading}
          rangeLabel={label}
        />
        <EventsOverTimeChart
          data={eventsOverTime.data ?? []}
          isLoading={eventsOverTime.isLoading}
          rangeLabel={label}
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
