"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Zap, BellRing, Shield, Users, BarChart3 } from "lucide-react";
import { InteractiveMap } from "@/components/map/InteractiveMap";
import { trpc } from "@/lib/trpc/client";
import { useSession } from "next-auth/react";
import { KpiStrip } from "./_components/kpi-strip";
import { AlertsPanel, type AlertItem } from "./_components/alerts-panel";
import { EventFeed, type FeedEvent } from "./_components/event-feed";
import {
  ActivePatrols,
  type ActivePatrol,
} from "./_components/active-patrols";
import {
  LastIncidentCard,
  type LastIncident,
} from "./_components/last-incident-card";
import { LiveTile } from "./_components/live-tile";
import { BreakdownBars } from "./_components/breakdown-bars";
import { ProtectedZoneCard } from "./_components/protected-zone-card";
import { RangerRoster } from "./_components/ranger-roster";
import type { RosterRanger } from "./_components/ranger-roster";
import { MapMunicipalitySelect } from "./_components/map-municipality-select";
import {
  DashboardRangeProvider,
  useDashboardRange,
} from "./_components/range-context";
import { PatrolDetailModal } from "./_components/patrol-detail-modal";
import { BreakdownDrilldownModal } from "./_components/breakdown-drilldown-modal";
import { KpiDrilldownModal } from "./_components/kpi-drilldown-modal";
import type { KpiDrilldown } from "./_components/kpi-strip";
import { AlertDetailModal } from "./_components/alert-detail-modal";
import { EventDetailModal } from "@/components/events/event-detail-modal";

/**
 * WAR ROOM command center — the live operations dashboard.
 *
 * Restructures the dashboard into the multi-zone command-center layout from the
 * owner-approved mockup docs/v2/mpa-command-center-v6.jsx (INHERIT-not-REPLACE).
 * All data comes from existing tRPC routers; no new product entities invented.
 *
 * 2026-06-21 — Alert ACK feature wired (owner-approved):
 *   - alertHistory.list now returns acknowledgedAt / acknowledgedBy
 *   - alertHistory.acknowledge mutation wires the ACK button in AlertsPanel
 *   - dashboard.alertStats now returns true unacknowledged count (not proxy)
 *   - KPI tile updated from "Recent Alerts" to "Unacknowledged"
 *
 * 2026-06-25 — War Room date-range drill-down (goal items 3-4):
 *   - DashboardRangeProvider holds the active FROM/TO window (default last 7 days)
 *   - DateRangeHeader lets the operator scope the window
 *   - every range-aware dashboard.* query reads the range from context (T4)
 */
export default function DashboardPage() {
  return (
    <DashboardRangeProvider>
      <DashboardContent />
    </DashboardRangeProvider>
  );
}

function DashboardContent() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  // Active FROM/TO range, shared across the page (default [now - 7 days, now]).
  // Pass it into every range-aware dashboard.* query so all panels re-query in
  // lock-step when the operator changes the window. The dashboard procedures
  // accept an optional { dateFrom, dateTo } (T1).
  const { from, to } = useDashboardRange();
  const range = { dateFrom: from, dateTo: to };

  const kpis = trpc.dashboard.kpis.useQuery(range);
  const breakdown = trpc.dashboard.eventBreakdown.useQuery(range);
  const recent = trpc.dashboard.recentEvents.useQuery(range);
  const alertStats = trpc.dashboard.alertStats.useQuery(range);
  const lastIncident = trpc.dashboard.lastIncident.useQuery(range);
  // Alerts & Escalations follows the same War Room range as every other panel
  // (2026-06-27): pass the active FROM/TO window so it re-queries in lock-step.
  const alerts = trpc.alertHistory.list.useQuery({ limit: 10, ...range });
  const patrols = trpc.dashboard.activePatrols.useQuery(range);
  // protected-zone coverage is a time-based activity aggregation windowed by
  // occurrence time (patrol.startTime / event.reportedAt), so it honours the War
  // Room range (T4b). Its procedure accepts
  // the same { dateFrom, dateTo } shape as dashboard.* (backward-compatible:
  // omitting it keeps the original 30-day default), so it re-queries in
  // lock-step too.
  const zoneData =
    trpc.municipalityCoverage.protectedZoneCoverage.useQuery(range);
  // KPI sparkline series + ranger roster (Command Center redesign, sub-batch C)
  // — both range-aware, read-only aggregations that re-query in lock-step.
  const trends = trpc.dashboard.kpiTrends.useQuery(range);
  const roster = trpc.dashboard.rangerRoster.useQuery(range);
  // Subject positions for the live map — the SAME query InteractiveMap runs
  // internally, so React Query dedupes it (no extra network round-trip). Used
  // by Q2 (2026-07-07) to resolve a clicked roster ranger to a map coordinate
  // (matched by name — Subject and KnownRanger share no client-visible FK).
  const subjects = trpc.map.subjects.list.useQuery();

  // Track which alert ID is currently being acknowledged (optimistic spinner).
  const [ackingId, setAckingId] = useState<string | null>(null);

  // Command Center map municipality filter (2026-07-04) — CC-local state, not
  // shared with the Interactive Report Map's ReportFilterProvider. Selecting a
  // municipality narrows the CC map's event markers and auto-frames that
  // municipality (InteractiveMap's own officialBoundaries fitBounds effect);
  // null means "all municipalities" (no filter, default CC framing).
  const [mapMunicipalityId, setMapMunicipalityId] = useState<string | null>(
    null,
  );

  // Per-user CC map municipality persistence (2026-07-04) — restores the
  // saved selection across refresh + re-login on any device. `hydratedMuniPref`
  // guards against the resolving query clobbering an in-session change the
  // operator makes before the initial fetch resolves; it fires exactly once.
  const ccMuniPref = trpc.user.getCommandCenterMunicipality.useQuery();
  const municipalitiesForValidation = trpc.municipality.list.useQuery();
  const setCcMuniPref = trpc.user.setCommandCenterMunicipality.useMutation();
  const hydratedMuniPref = useRef(false);
  useEffect(() => {
    if (hydratedMuniPref.current) return;
    if (ccMuniPref.data === undefined) return; // still loading
    const savedId = ccMuniPref.data.municipalityId;
    if (savedId === null) {
      hydratedMuniPref.current = true;
      return;
    }
    if (municipalitiesForValidation.data === undefined) return; // wait to validate
    const isValid = municipalitiesForValidation.data.some(
      (m) => m.id === savedId,
    );
    setMapMunicipalityId(isValid ? savedId : null);
    hydratedMuniPref.current = true;
  }, [ccMuniPref.data, municipalitiesForValidation.data]);

  const handleMapMunicipalityChange = useCallback(
    (id: string | null) => {
      setMapMunicipalityId(id);
      setCcMuniPref.mutate({ municipalityId: id });
    },
    [setCcMuniPref],
  );

  // Click→detail drill-down (T5): event-feed rows + last-incident open the
  // shared EventDetailModal; active-patrols rows open a lightweight patrol modal.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPatrol, setSelectedPatrol] = useState<ActivePatrol | null>(
    null,
  );

  // Recent Patrols row → focus the CC map on that patrol's track (2026-07-06),
  // mirroring the Interactive Report Map's controlled-selection pattern
  // (report-map-view.tsx selectPatrol/selectPatrolById). Kept separate from
  // `selectedPatrol` (which drives the read-only detail modal) so a click both
  // opens the modal AND frames the map — closing the modal leaves the map
  // framed on that patrol until the operator picks another row or clicks the
  // empty basemap (onBackgroundClick below).
  const [selectedMapPatrolId, setSelectedMapPatrolId] = useState<string | null>(
    null,
  );
  const handleSelectPatrol = useCallback((p: ActivePatrol) => {
    setSelectedPatrol(p);
    setSelectedMapPatrolId(p.id);
  }, []);
  const selectMapPatrolById = useCallback(
    (patrolId: string) => {
      const p = patrols.data?.find((x) => x.id === patrolId);
      setSelectedMapPatrolId(patrolId);
      if (p !== undefined) setSelectedPatrol(p);
    },
    [patrols.data],
  );
  const clearMapPatrolSelection = useCallback(() => {
    setSelectedMapPatrolId(null);
  }, []);

  // Q2 (2026-07-07) — click a Ranger Roster row to fly the live map to that
  // ranger's last-known position. Reuses InteractiveMap's `focusLocation`
  // flyTo prop (the same one the Report Map's "locate" button uses). The `key`
  // bumps on every click so re-clicking the same ranger re-triggers the flyTo.
  const [rangerFocus, setRangerFocus] = useState<{
    lon: number;
    lat: number;
    key: number;
  } | null>(null);
  const rangerFocusKey = useRef(0);
  // name (normalized) → last position, built from the map subjects list.
  const rangerPositionByName = useMemo(() => {
    const m = new Map<string, { lat: number; lon: number }>();
    for (const s of subjects.data ?? []) {
      if (s.lastPositionLat === null || s.lastPositionLon === null) continue;
      m.set(s.name.trim().toLowerCase(), {
        lat: s.lastPositionLat,
        lon: s.lastPositionLon,
      });
    }
    return m;
  }, [subjects.data]);
  // Which roster rangers actually resolve to a position (drives which rows the
  // roster renders as clickable buttons).
  const locatableRangerNames = useMemo(() => {
    const s = new Set<string>();
    for (const r of roster.data?.rangers ?? []) {
      const key = r.name.trim().toLowerCase();
      if (rangerPositionByName.has(key)) s.add(key);
    }
    return s;
  }, [roster.data, rangerPositionByName]);
  const handleSelectRanger = useCallback(
    (ranger: RosterRanger) => {
      const pos = rangerPositionByName.get(ranger.name.trim().toLowerCase());
      if (pos === undefined) return;
      rangerFocusKey.current += 1;
      setRangerFocus({ lon: pos.lon, lat: pos.lat, key: rangerFocusKey.current });
    },
    [rangerPositionByName],
  );

  // Command Center "hide idle rangers" map toggle (2026-07-06) — default OFF
  // (idle rangers SHOWN, owner-approved default). Idle ranger NAMES are
  // derived from dashboard.rangerRoster (already fetched below for the
  // roster panel) and matched against InteractiveMap's subject markers by
  // name (Subject and KnownRanger share no client-visible FK).
  const [hideIdleRangers, setHideIdleRangers] = useState(false);
  // Click→detail for fired-alert rows: opens a read-only AlertDetailModal.
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  // T5b — drill-down from KPI tiles + breakdown bars into the underlying
  // in-range record lists (event.list / patrol.list) via dedicated modals.
  const [selectedBreakdownType, setSelectedBreakdownType] = useState<
    string | null
  >(null);
  const [selectedKpi, setSelectedKpi] = useState<KpiDrilldown | null>(null);

  // ISO strings for the active range, shared by the drill-down modals.
  const rangeIso = { dateFrom: from.toISOString(), dateTo: to.toISOString() };

  // Human-readable label for the active range (e.g. "Jun 19 – Jun 26"), shown
  // on the coverage cards in place of the old hardcoded "30 days".
  const rangeLabel = `${from.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${to.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;

  const acknowledgeMutation = trpc.alertHistory.acknowledge.useMutation({
    onSuccess: async () => {
      // Refetch alerts list + alertStats KPI on success.
      await Promise.all([
        utils.alertHistory.list.invalidate(),
        utils.dashboard.alertStats.invalidate(),
      ]);
      setAckingId(null);
    },
    onError: () => {
      setAckingId(null);
    },
  });

  const handleAcknowledge = useCallback(
    (id: string) => {
      if (ackingId !== null) return; // debounce concurrent clicks
      setAckingId(id);
      acknowledgeMutation.mutate({ id });
    },
    [ackingId, acknowledgeMutation],
  );

  // Determine if the current user can acknowledge alerts (admin roles only).
  const userRoles: string[] = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  const canAck = userRoles.some(
    (r) => r === "super_admin" || r === "site_admin" || r === "administrator",
  );

  // Ticking clock drives relative-time freshness ("Xm ago") without refetching.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, []);
  const nowValue = now ?? undefined;

  // Freshness = most recent successful fetch across the live queries.
  const lastSyncedAt = Math.max(
    kpis.dataUpdatedAt,
    recent.dataUpdatedAt,
    alerts.dataUpdatedAt,
    patrols.dataUpdatedAt,
  );

  // Daily-count series for the KPI sparklines (Command Center sub-batch C).
  const eventTrend = trends.data?.events.map((d) => d.count);
  const patrolTrend = trends.data?.patrols.map((d) => d.count);

  const kpiTiles = [
    {
      label: "Active Events",
      value: kpis.data?.activeEvents ?? 0,
      icon: Zap,
      valueClass: "text-[hsl(var(--warning))]",
      drilldown: { kind: "activeEvents" } as const,
      trend: eventTrend,
      trendColorVar: "--warning",
    },
    {
      label: "Unacknowledged",
      value: alertStats.data?.unacknowledged ?? 0,
      icon: BellRing,
      valueClass: "text-destructive",
      sub: "alerts last 24h",
    },
    {
      label: "Active Patrols",
      value: kpis.data?.activePatrols ?? 0,
      icon: Shield,
      valueClass: "text-foreground",
      drilldown: { kind: "activePatrols" } as const,
      trend: patrolTrend,
      trendColorVar: "--info",
    },
    {
      label: "Rangers on Duty",
      value: kpis.data?.rangersOnDuty ?? 0,
      icon: Users,
      valueClass: "text-[hsl(var(--success))]",
    },
    {
      label: "Events This Month",
      value: kpis.data?.eventsThisMonth ?? 0,
      icon: BarChart3,
      valueClass: "text-[hsl(var(--info))]",
      drilldown: { kind: "eventsThisMonth" } as const,
      trend: eventTrend,
      trendColorVar: "--info",
      ...(kpis.data
        ? (() => {
            const delta = kpis.data.eventsThisMonth - kpis.data.eventsLastMonth;
            return {
              sub: `${delta > 0 ? "+" : ""}${String(delta)} vs last month`,
              subClass:
                delta > 0
                  ? "text-[hsl(var(--success))]"
                  : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
            };
          })()
        : {}),
    },
  ];

  const alertItems: AlertItem[] = (alerts.data?.items ?? []).map((a) => ({
    id: a.id,
    firedAt: a.firedAt,
    matchedPriority: a.matchedPriority,
    ruleName: a.alertRule?.name ?? a.ruleNameSnapshot,
    eventTitle: a.event?.title ?? a.eventTitleSnapshot,
    eventId: a.event?.id ?? null,
    acknowledgedAt: a.acknowledgedAt,
    acknowledgedBy: a.acknowledgedBy,
  }));

  const feedEvents: FeedEvent[] = recent.data ?? [];

  const activePatrols: ActivePatrol[] = patrols.data ?? [];

  const incident: LastIncident = lastIncident.data ?? null;

  // Active-ranger names (CC-1) — derived from the roster query already
  // fetched for the Ranger Roster panel below; no extra tRPC call. This is
  // an ALLOWLIST (status "on_patrol" or "active", i.e. anything not idle) so
  // "Hide idle on map" also hides non-roster ER subjects that have no
  // KnownRanger entry at all — an idle-name denylist would miss those.
  const activeRangerNames = new Set(
    (roster.data?.rangers ?? [])
      .filter((r) => r.status !== "idle")
      .map((r) => r.name),
  );

  return (
    <div className="command-center flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <h1 className="sr-only">Command Center — War Room</h1>

      {/* Status band — a dedicated LIVE status tile + the Last Incident tile
          fold into the left of the KPI strip (one slim band instead of two
          stacked rows) + at-a-glance KPIs. The Command Center is a fixed LIVE
          last-48h window (no date picker — 2026-07-04); the LIVE badge now has
          its own tile (split out of Last Incident) so it reads as a real
          status indicator rather than a clickable incident metric. */}
      <KpiStrip
        kpis={kpiTiles}
        lastSyncedAt={lastSyncedAt || undefined}
        onSelectKpi={setSelectedKpi}
        leading={
          <>
            <LiveTile />
            <LastIncidentCard
              incident={incident}
              now={nowValue}
              onSelect={setSelectedEventId}
            />
          </>
        }
      />

      {/* Main row — dominant live map (2/3) + the live operations rail (1/3).
          flex-1 lets it grow to fill the viewport on a big war-room display
          (fullscreen → fits one screen), while min-h-[20rem] keeps the map
          usable when the window is small/narrow. In that case the whole column
          simply scrolls (outer overflow-y-auto) instead of cards overlapping. */}
      <div className="grid min-h-[20rem] flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <div
          role="region"
          aria-label="Live patrol map showing ranger positions, patrol areas and events"
          className="cc-gridbg relative min-h-[14rem] overflow-hidden rounded-xl border border-[hsl(var(--panel-border))] lg:col-span-2"
        >
          <InteractiveMap
            className="relative z-10 h-full w-full"
            dateFrom={from}
            dateTo={to}
            trackMode="inRange"
            controlsPlacement="floating"
            defaultEventLayers={{ lawEnforcement: true, monitoring: true }}
            filterSlot={
              <MapMunicipalitySelect
                value={mapMunicipalityId}
                onChange={handleMapMunicipalityChange}
              />
            }
            {...(mapMunicipalityId !== null
              ? { municipalityId: mapMunicipalityId }
              : {})}
            /* CC-1 — idle-ranger marker filter (roster-driven, default OFF). */
            activeSubjectNames={activeRangerNames}
            hideIdleSubjects={hideIdleRangers}
            /* CC-2 — Recent Patrols row click focuses + isolates that
               patrol's track (only while a row-driven selection is active —
               omitted entirely when none is selected so the map's own
               internal PatrolSelector drill-down keeps working, mirroring
               report-map-view.tsx). */
            {...(selectedMapPatrolId !== null
              ? { selectedPatrolId: selectedMapPatrolId }
              : {})}
            onPatrolTrackClick={selectMapPatrolById}
            onBackgroundClick={clearMapPatrolSelection}
            /* Q2 — Ranger Roster row click flies the map to that ranger's
               last-known position (matched by name → subject coordinate). */
            focusLocation={rangerFocus}
            /* CC-3 — 48h event markers open the shared EventDetailModal
               (same modal + state the Live Event Feed / Last Incident use). */
            onEventClick={setSelectedEventId}
          />
        </div>

        {/* Live operations rail — alerts → feed → active patrols. Last Incident
            now lives in the KPI strip leading slot (2026-07-04). Scrolls
            internally so the live panels never push the page taller than the
            viewport. */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <AlertsPanel
            alerts={alertItems}
            isLoading={alerts.isLoading}
            now={nowValue}
            canAck={canAck}
            ackingId={ackingId}
            onAcknowledge={handleAcknowledge}
            onSelectAlert={setSelectedAlert}
          />
          <EventFeed
            events={feedEvents}
            isLoading={recent.isLoading}
            now={nowValue}
            onSelectEvent={setSelectedEventId}
          />
          <ActivePatrols
            patrols={activePatrols}
            isLoading={patrols.isLoading}
            now={nowValue}
            onSelectPatrol={handleSelectPatrol}
            selectedPatrolId={selectedMapPatrolId}
          />
        </div>
      </div>

      {/* Analytics band — full width beneath the map: breakdowns + coverage +
          ranger roster. One row on wide command-center displays, wrapping down
          on smaller screens. `compact` on the breakdown cards + the tighter
          gap keep the band's height visually balanced with the rest of the
          dashboard (it previously ran noticeably taller than every other
          section). */}
      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <BreakdownBars
          title="Law Enforcement and Apprehensions"
          data={breakdown.data?.lawEnforcement ?? []}
          variant="law_enforcement"
          onSelectType={setSelectedBreakdownType}
          compact
        />
        <BreakdownBars
          title="Monitoring, Patrolling & Surveillance"
          data={breakdown.data?.monitoring ?? []}
          variant="monitoring"
          onSelectType={setSelectedBreakdownType}
          compact
        />
        <ProtectedZoneCard
          zones={zoneData.data ?? []}
          isLoading={zoneData.isLoading}
          rangeLabel={rangeLabel}
        />
        <RangerRoster
          rangers={roster.data?.rangers ?? []}
          summary={
            roster.data?.summary ?? {
              total: 0,
              onPatrol: 0,
              active: 0,
              idle: 0,
            }
          }
          isLoading={roster.isLoading}
          now={nowValue}
          hideIdleRangers={hideIdleRangers}
          onHideIdleRangersChange={setHideIdleRangers}
          onSelectRanger={handleSelectRanger}
          locatableRangerNames={locatableRangerNames}
        />
      </div>

      <EventDetailModal
        eventId={selectedEventId}
        onClose={() => {
          setSelectedEventId(null);
        }}
      />
      <PatrolDetailModal
        patrol={selectedPatrol}
        now={nowValue}
        onClose={() => {
          setSelectedPatrol(null);
        }}
      />
      <AlertDetailModal
        alert={selectedAlert}
        now={nowValue}
        onClose={() => {
          setSelectedAlert(null);
        }}
        onOpenEvent={(eventId) => {
          // Close the alert modal, then open the shared event detail modal.
          setSelectedAlert(null);
          setSelectedEventId(eventId);
        }}
      />
      <BreakdownDrilldownModal
        typeDisplay={selectedBreakdownType}
        dateFrom={rangeIso.dateFrom}
        dateTo={rangeIso.dateTo}
        onClose={() => {
          setSelectedBreakdownType(null);
        }}
      />
      <KpiDrilldownModal
        drilldown={selectedKpi}
        dateFrom={rangeIso.dateFrom}
        dateTo={rangeIso.dateTo}
        onClose={() => {
          setSelectedKpi(null);
        }}
      />
    </div>
  );
}
