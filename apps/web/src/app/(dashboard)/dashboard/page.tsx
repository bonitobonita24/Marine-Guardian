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
  // municipality / protected-zone coverage are intentionally NOT range-threaded:
  // their procedures expose { since, until } (municipalityCoverage) / no input
  // (protectedZoneCoverage) — not the { dateFrom, dateTo } shape the War Room
  // range uses — so they keep their own default 30-day windows (T4 spec).
  const coverageData = trpc.municipalityCoverage.municipalityCoverage.useQuery();
  const zoneData = trpc.municipalityCoverage.protectedZoneCoverage.useQuery();

  // Track which alert ID is currently being acknowledged (optimistic spinner).
  const [ackingId, setAckingId] = useState<string | null>(null);

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

      <KpiStrip kpis={kpiTiles} lastSyncedAt={lastSyncedAt || undefined} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        {/* Map + charts zone */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <div
            role="region"
            aria-label="Live patrol map showing ranger positions, patrol areas and events"
            className="relative min-h-[18rem] flex-1 overflow-hidden rounded-xl border border-border"
          >
            <InteractiveMap className="h-full w-full" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <BreakdownBars
              title="Law Enforcement"
              data={breakdown.data?.lawEnforcement ?? []}
              variant="law_enforcement"
            />
            <BreakdownBars
              title="Monitoring"
              data={breakdown.data?.monitoring ?? []}
              variant="monitoring"
            />
            <LastIncidentCard incident={incident} now={nowValue} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <MunicipalityCoverageChart
              data={coverageData.data ?? []}
              isLoading={coverageData.isLoading}
            />
            <ProtectedZoneCard
              zones={zoneData.data ?? []}
              isLoading={zoneData.isLoading}
            />
          </div>
        </div>

        {/* Alerts / patrols / feed zone */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <AlertsPanel
            alerts={alertItems}
            isLoading={alerts.isLoading}
            now={nowValue}
            canAck={canAck}
            ackingId={ackingId}
            onAcknowledge={handleAcknowledge}
          />
          <EventFeed
            events={feedEvents}
            isLoading={recent.isLoading}
            now={nowValue}
          />
          <ActivePatrols
            patrols={activePatrols}
            isLoading={patrols.isLoading}
            now={nowValue}
          />
        </div>
      </div>
    </div>
  );
}
