"use client";

import { useCallback, useEffect, useState } from "react";
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
import { BreakdownBars } from "./_components/breakdown-bars";
import { MunicipalityCoverageChart } from "./_components/municipality-coverage-chart";
import { ProtectedZoneCard } from "./_components/protected-zone-card";
import {
  DashboardRangeProvider,
  useDashboardRange,
} from "./_components/range-context";
import { DateRangeHeader } from "./_components/date-range-header";
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
  const alerts = trpc.alertHistory.list.useQuery({ limit: 10 });
  const patrols = trpc.dashboard.activePatrols.useQuery(range);
  // municipality / protected-zone coverage are time-based activity aggregations
  // (patrol startTime / event reportedAt / zone-coverage assignedAt), so both
  // honour the War Room range (T4b). Their procedures now accept the same
  // { dateFrom, dateTo } shape as dashboard.* (backward-compatible: omitting it
  // keeps the original 30-day default), so they re-query in lock-step too.
  const coverageData =
    trpc.municipalityCoverage.municipalityCoverage.useQuery(range);
  const zoneData =
    trpc.municipalityCoverage.protectedZoneCoverage.useQuery(range);

  // Track which alert ID is currently being acknowledged (optimistic spinner).
  const [ackingId, setAckingId] = useState<string | null>(null);

  // Click→detail drill-down (T5): event-feed rows + last-incident open the
  // shared EventDetailModal; active-patrols rows open a lightweight patrol modal.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPatrol, setSelectedPatrol] = useState<ActivePatrol | null>(
    null,
  );
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
  const canAck = userRoles.some((r) => r === "super_admin" || r === "site_admin");

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

  const kpiTiles = [
    {
      label: "Active Events",
      value: kpis.data?.activeEvents ?? 0,
      icon: Zap,
      valueClass: "text-[hsl(var(--warning))]",
      drilldown: { kind: "activeEvents" } as const,
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

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <h1 className="sr-only">Command Center — War Room</h1>

      <DateRangeHeader />

      <KpiStrip
        kpis={kpiTiles}
        lastSyncedAt={lastSyncedAt || undefined}
        onSelectKpi={setSelectedKpi}
      />

      {/* Command-center layout (Item 5): the map is the dominant element.
          A 4-column grid gives the map 3/4 of the width and full content
          height (~65-70% of the area); a compact right rail stacks the live
          alerts / event-feed / patrols panels. The analytic cards (breakdown
          ×2, last-incident, coverage ×2) sit in a visibly smaller band below,
          arranged around/under the map. Everything stacks on mobile. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-4">
        {/* DOMINANT map zone */}
        <div
          role="region"
          aria-label="Live patrol map showing ranger positions, patrol areas and events"
          className="relative min-h-[24rem] overflow-hidden rounded-xl border border-border lg:col-span-3"
        >
          <InteractiveMap className="h-full w-full" />
        </div>

        {/* Compact live-ops right rail */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-1">
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
            onSelectPatrol={setSelectedPatrol}
          />
        </div>
      </div>

      {/* Compact analytics band — visibly smaller than the map, below it. */}
      <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <BreakdownBars
          title="Law Enforcement and Apprehensions"
          data={breakdown.data?.lawEnforcement ?? []}
          variant="law_enforcement"
          onSelectType={setSelectedBreakdownType}
        />
        <BreakdownBars
          title="Monitoring, Patrolling & Surveillance"
          data={breakdown.data?.monitoring ?? []}
          variant="monitoring"
          onSelectType={setSelectedBreakdownType}
        />
        <LastIncidentCard
          incident={incident}
          now={nowValue}
          onSelect={setSelectedEventId}
        />
        <MunicipalityCoverageChart
          data={coverageData.data ?? []}
          isLoading={coverageData.isLoading}
          rangeLabel={rangeLabel}
        />
        <ProtectedZoneCard
          zones={zoneData.data ?? []}
          isLoading={zoneData.isLoading}
          rangeLabel={rangeLabel}
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
