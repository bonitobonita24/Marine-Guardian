"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert, Binoculars } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { InteractiveMap } from "@/components/map/InteractiveMap";
import { EventDetailModal } from "@/components/events/event-detail-modal";
import {
  ReportFilterProvider,
  useReportFilter,
} from "@/components/reporting/report-filter-context";
import { ReportFilterBar } from "@/components/reporting/report-filter-bar";
import { BreakdownBars } from "@/app/[tenant]/(dashboard)/dashboard/_components/breakdown-bars";
import { HighPriorityEventsCard } from "./high-priority-events-card";
import {
  PatrolListByRangeCard,
  type RangePatrol,
} from "./patrol-list-by-range-card";
import { SelectedPatrolMapPanel } from "./selected-patrol-map-panel";
import {
  EventTypeEventsPanel,
  type EventTypeEventsPanelEvent,
} from "./event-type-events-panel";
import { EventsOverTimeChart } from "@/components/reporting/events-over-time-chart";
import { MunicipalityCoverageChart } from "@/app/[tenant]/(dashboard)/dashboard/_components/municipality-coverage-chart";
import {
  ReportMapEmptyState,
  shouldShowReportMapEmptyState,
} from "./report-map-empty-state";
import { GeneratePrintableButton } from "./generate-printable-button";

/**
 * Interactive Report Map (2026-06-27) — a presentation surface for reporting to
 * the Mayor / investors. The shared {from,to,municipalityId} filter (provider)
 * scopes every panel in lock-step: the map markers + patrol tracks, the category
 * breakdown, the high-priority events list, and the events-over-time line. The
 * dashboard breakdown chart is reused in-place (pure presentational). (The top
 * KPI strip was removed 2026-06-28; the Municipality Coverage chart was replaced
 * 2026-06-28 with the High Priority Events list per owner request.)
 */

/**
 * "MMM d – MMM d" for a same-year range (clean, no redundant year). When the
 * range crosses a calendar year boundary, the bare month/day reads ambiguously
 * (e.g. "Jan 1 – Jul 6" over 2025→2026), so both ends get the year appended:
 * "MMM d, yyyy – MMM d, yyyy".
 */
export function rangeLabel(from: Date, to: Date): string {
  const crossesYear = from.getFullYear() !== to.getFullYear();
  const fmt = (d: Date) =>
    d.toLocaleDateString(
      undefined,
      crossesYear
        ? { month: "short", day: "numeric", year: "numeric" }
        : { month: "short", day: "numeric" },
    );
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
  const { from, to, municipalityId, protectedZoneId, terrain, province, includeChildren } =
    useReportFilter();
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
    ...(terrain !== null ? { terrain } : {}),
    ...(province !== null ? { province } : {}),
    ...(includeChildren ? { includeChildren } : {}),
  };

  // eventBreakdownWithCoords (not the lean eventBreakdown) — the Report Map
  // needs each row's per-event detail (id/location/etc.) so a clicked bar can
  // open the EventTypeEventsPanel drill-down list (2026-07-06). Per-type
  // counts are identical between the two procedures (see reportMap.ts).
  const breakdown = trpc.reportMap.eventBreakdownWithCoords.useQuery(filter);
  const eventsOverTime = trpc.reportMap.eventsOverTime.useQuery(filter);
  const highPriority = trpc.reportMap.highPriorityEvents.useQuery(filter);
  const patrolsInRange = trpc.reportMap.patrolsInRange.useQuery(filter);
  // Uncapped patrol total (patrolsInRange is capped at 300 rows server-side)
  // — powers the "Patrols" card badge + the "Showing N of M" note so the
  // header never lies about how many patrols actually matched the filter.
  const summary = trpc.reportMap.summary.useQuery(filter);
  // Municipality Coverage chart — same report filter, mapped to the
  // {dateFrom,dateTo} shape this router expects. Scoped to the selected
  // municipality when one is picked, or to the selected province rollup
  // (Phase 4B — municipalityId always wins over province, resolved server-side
  // via the shared resolveMunicipalityScope), matching every other panel on
  // this page.
  const municipalityCoverage =
    trpc.municipalityCoverage.municipalityCoverage.useQuery({
      dateFrom: from,
      dateTo: to,
      ...(municipalityId !== null ? { municipalityId } : {}),
      ...(municipalityId === null && province !== null ? { province } : {}),
    });

  // Selected patrol from the "Patrols" list (or a track click on the map) →
  // the map isolates + draws that patrol's track (controlled selectedPatrolId),
  // flies to its start point, and shows its full detail in the floating panel
  // on the map's upper-right (SelectedPatrolMapPanel). Clicking the empty
  // basemap deselects: panel dismissed, highlight cleared, all tracks restored.
  const [selectedPatrolId, setSelectedPatrolId] = useState<string | null>(null);
  const selectPatrol = useCallback(
    (p: RangePatrol) => {
      setSelectedPatrolId(p.id);
      if (p.startLocationLat !== null && p.startLocationLon !== null) {
        locateOnMap(p.startLocationLat, p.startLocationLon);
      }
    },
    [locateOnMap],
  );
  const patrols = patrolsInRange.data;
  const selectedPatrol =
    selectedPatrolId === null
      ? null
      : (patrols?.find((p) => p.id === selectedPatrolId) ?? null);
  // A filter change (date range / municipality / zone) can refetch the patrol
  // list WITHOUT the currently-selected patrol. Left set, the stale id would
  // keep the map's track isolation active against a list it no longer matches
  // (every track hidden, no panel, no visible selection) — so clear the
  // selection once the loaded data genuinely lacks it. While the query is
  // in-flight (data undefined) the selection is kept.
  useEffect(() => {
    if (selectedPatrolId === null || patrols === undefined) return;
    if (!patrols.some((p) => p.id === selectedPatrolId)) {
      setSelectedPatrolId(null);
    }
  }, [patrols, selectedPatrolId]);
  const deselectPatrol = useCallback(() => {
    setSelectedPatrolId(null);
  }, []);
  // Map track click → the same select path the list rows use (fly-to included).
  const selectPatrolById = useCallback(
    (patrolId: string) => {
      const p = patrols?.find((x) => x.id === patrolId);
      if (p !== undefined) selectPatrol(p);
    },
    [patrols, selectPatrol],
  );

  // Clicked breakdown bar (Law Enforcement / Monitoring) → floating event list
  // on the map's upper-right (2026-07-06). Mutually exclusive with the
  // selected-patrol panel (same topRightSlot) — selecting one clears the
  // other. Re-clicking the same bar toggles it off.
  type EventTypeGroup = {
    variant: "law_enforcement" | "monitoring";
    display: string;
    events: EventTypeEventsPanelEvent[];
  };
  const [selectedEventTypeGroup, setSelectedEventTypeGroup] =
    useState<EventTypeGroup | null>(null);
  const selectEventType = useCallback(
    (variant: EventTypeGroup["variant"], display: string, events: EventTypeEventsPanelEvent[]) => {
      setSelectedPatrolId(null);
      setSelectedEventTypeGroup((prev) =>
        prev !== null && prev.variant === variant && prev.display === display
          ? null
          : { variant, display, events },
      );
    },
    [],
  );
  const deselectEventType = useCallback(() => {
    setSelectedEventTypeGroup(null);
  }, []);
  // Selecting a patrol (list row OR map track click) clears any open
  // event-type list — the two floating panels share one slot.
  const selectPatrolClearingEventType = useCallback(
    (p: RangePatrol) => {
      setSelectedEventTypeGroup(null);
      selectPatrol(p);
    },
    [selectPatrol],
  );
  const selectPatrolByIdClearingEventType = useCallback(
    (patrolId: string) => {
      setSelectedEventTypeGroup(null);
      selectPatrolById(patrolId);
    },
    [selectPatrolById],
  );
  // Clicking the empty basemap clears BOTH floating panels.
  const deselectAll = useCallback(() => {
    deselectPatrol();
    deselectEventType();
  }, [deselectPatrol, deselectEventType]);
  // A filter change can refetch the breakdown WITHOUT the currently-selected
  // event type (e.g. a municipality change that removes that type's only
  // events) — clear the stale selection the same way the patrol-selection
  // effect above does, so a drill-down list can't linger against data that no
  // longer contains it. While the query is in-flight, the selection is kept.
  useEffect(() => {
    if (selectedEventTypeGroup === null || breakdown.data === undefined) return;
    const rows =
      selectedEventTypeGroup.variant === "law_enforcement"
        ? breakdown.data.lawEnforcement
        : breakdown.data.monitoring;
    if (!rows.some((r) => r.type === selectedEventTypeGroup.display)) {
      setSelectedEventTypeGroup(null);
    }
  }, [breakdown.data, selectedEventTypeGroup]);

  // Municipality NAME for the empty-state message — derived from the same
  // dropdown options the filter bar renders (cached query, no extra fetch).
  const municipalities = trpc.municipality.list.useQuery();
  // When a specific municipality is selected, name it directly. Otherwise,
  // when scoped to a province rollup (no single municipality), fall back to
  // the province string itself so the empty-state below still names the
  // active scope truthfully instead of falling through to the "all
  // municipalities" generic (2026-07-09 province filter threading).
  const municipalityName =
    municipalityId !== null
      ? (municipalities.data?.find((m) => m.id === municipalityId)?.name ??
        null)
      : province;

  // Total events in the active range — the continuous daily series sums to the
  // same total as the full event count (the where-clause already bounds events
  // to [from,to], so every matched event lands in a bucket). Used purely to
  // decide whether to show the "nothing to show" empty state.
  const totalEvents = (eventsOverTime.data ?? []).reduce(
    (sum, d) => sum + d.count,
    0,
  );
  // Total patrols in the active range — a municipality can have foot-patrol
  // tracks with zero events in-window (patrols and events are independent
  // entities), so the blanket empty state must not fire just because events
  // are zero. Counted alongside totalEvents so the gate only fires when BOTH
  // are empty (see shouldShowReportMapEmptyState).
  const totalPatrols = (patrolsInRange.data ?? []).length;

  const showEmptyState = shouldShowReportMapEmptyState({
    municipalityId,
    province,
    totalEvents,
    totalPatrols,
    isLoading: eventsOverTime.isLoading || patrolsInRange.isLoading,
    municipalityName,
  });

  const label = rangeLabel(from, to);

  return (
    <div className="command-center flex h-full min-h-0 flex-col overflow-y-auto">
      {/* Above-the-fold block — the map + the 4-column analytics band fill the
          whole screen (in fullscreen AND normal view). The Events Over Time
          chart is rendered AFTER this block so it sits below the fold and is only
          reached by scrolling (owner request 2026-06-30: it must not be part of
          the full-screen view). */}
      <div className="flex h-full min-h-0 shrink-0 flex-col gap-2">
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
        className="cc-gridbg relative min-h-[18rem] flex-1 overflow-hidden rounded-xl border border-[hsl(var(--panel-border))]"
      >
        <InteractiveMap
          className="relative z-10 h-full w-full"
          dateFrom={from}
          dateTo={to}
          {...(municipalityId !== null ? { municipalityId } : {})}
          {...(protectedZoneId !== null ? { protectedZoneId } : {})}
          {...(province !== null ? { province } : {})}
          {...(includeChildren ? { includeChildren } : {})}
          trackMode="inRange"
          defaultEventLayers={{ lawEnforcement: true, monitoring: true }}
          hidePatrolSelector
          hideSubjects
          controlsPlacement="floating"
          doodleSurface="report-map"
          filterSlot={<ReportFilterBar layout="stacked" />}
          onEventClick={setSelectedEventId}
          focusLocation={focusLocation}
          selectedPatrolId={selectedPatrolId}
          onPatrolTrackClick={selectPatrolByIdClearingEventType}
          onBackgroundClick={deselectAll}
          topRightSlot={
            selectedEventTypeGroup !== null ? (
              <EventTypeEventsPanel
                display={selectedEventTypeGroup.display}
                events={selectedEventTypeGroup.events}
                onLocate={locateOnMap}
                onSelectEvent={setSelectedEventId}
                onClose={deselectEventType}
              />
            ) : selectedPatrol !== null ? (
              <SelectedPatrolMapPanel
                patrol={selectedPatrol}
                onClose={deselectPatrol}
              />
            ) : null
          }
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
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 xl:min-h-[11rem] xl:[&>*]:h-full">
          <BreakdownBars
            title="Law Enforcement and Apprehensions"
            titleIcon={ShieldAlert}
            variant="law_enforcement"
            data={breakdown.data?.lawEnforcement ?? []}
            onSelectType={(type) => {
              const row = breakdown.data?.lawEnforcement.find(
                (r) => r.type === type,
              );
              if (row !== undefined) {
                selectEventType("law_enforcement", type, row.events);
              }
            }}
            selectedType={
              selectedEventTypeGroup?.variant === "law_enforcement"
                ? selectedEventTypeGroup.display
                : undefined
            }
            compact
          />
          <BreakdownBars
            title="Monitoring, Patrolling and Surveillance"
            titleIcon={Binoculars}
            variant="monitoring"
            data={breakdown.data?.monitoring ?? []}
            onSelectType={(type) => {
              const row = breakdown.data?.monitoring.find(
                (r) => r.type === type,
              );
              if (row !== undefined) {
                selectEventType("monitoring", type, row.events);
              }
            }}
            selectedType={
              selectedEventTypeGroup?.variant === "monitoring"
                ? selectedEventTypeGroup.display
                : undefined
            }
            compact
          />
          <HighPriorityEventsCard
            events={highPriority.data?.events ?? []}
            total={highPriority.data?.total ?? 0}
            isLoading={highPriority.isLoading}
            onSelect={setSelectedEventId}
            onLocate={locateOnMap}
          />
          {/* Patrol list (owner request 2026-06-29) — takes the slot the Events
              Over Time chart used to occupy; clicking a patrol draws its track
              on the map. The chart moves to its own full-width row below. */}
          <PatrolListByRangeCard
            patrols={patrolsInRange.data ?? []}
            isLoading={patrolsInRange.isLoading}
            selectedPatrolId={selectedPatrolId}
            onSelect={selectPatrolClearingEventType}
            totalCount={summary.data?.totalPatrols}
          />
        </div>
      )}
      </div>
      {/* end above-the-fold block */}

      {/* Events Over Time — BELOW the fold (scroll to see). Full-width + taller
          so the trend reads clearly; intentionally NOT part of the map+analytics
          full-screen view (owner request 2026-06-30). */}
      {!showEmptyState && (
        <div className="shrink-0 space-y-2 pt-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <EventsOverTimeChart
              data={eventsOverTime.data ?? []}
              isLoading={eventsOverTime.isLoading}
              rangeLabel={label}
              compact
            />
            <MunicipalityCoverageChart
              data={municipalityCoverage.data ?? []}
              isLoading={municipalityCoverage.isLoading}
              rangeLabel={label}
              compact
              groupByProvince={municipalityId === null}
            />
          </div>
          <div className="flex justify-end">
            <GeneratePrintableButton />
          </div>
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
