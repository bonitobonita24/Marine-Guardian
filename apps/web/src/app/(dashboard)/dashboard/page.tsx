"use client";

import { useEffect, useState } from "react";
import { InteractiveMap } from "@/components/map/InteractiveMap";
import { trpc } from "@/lib/trpc/client";
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

/**
 * WAR ROOM command center — the live operations dashboard.
 *
 * Restructures the dashboard into the multi-zone command-center layout from the
 * owner-approved mockup docs/v2/mpa-command-center-v6.jsx (INHERIT-not-REPLACE).
 * All data comes from existing tRPC routers; no new product entities invented.
 */
export default function DashboardPage() {
  const kpis = trpc.dashboard.kpis.useQuery();
  const breakdown = trpc.dashboard.eventBreakdown.useQuery();
  const recent = trpc.dashboard.recentEvents.useQuery();
  const alertStats = trpc.dashboard.alertStats.useQuery();
  const lastIncident = trpc.dashboard.lastIncident.useQuery();
  const alerts = trpc.alertHistory.list.useQuery({ limit: 10 });
  const patrols = trpc.patrol.list.useQuery({ state: "open", limit: 50 });

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
      glyph: "⚡",
      valueClass: "text-[hsl(var(--warning))]",
    },
    {
      label: "Recent Alerts",
      value: alertStats.data?.recentAlerts ?? 0,
      glyph: "🔴",
      valueClass: "text-destructive",
      sub: "last 24h",
    },
    {
      label: "Active Patrols",
      value: kpis.data?.activePatrols ?? 0,
      glyph: "🚤",
      valueClass: "text-foreground",
    },
    {
      label: "Rangers on Duty",
      value: kpis.data?.rangersOnDuty ?? 0,
      glyph: "👥",
      valueClass: "text-[hsl(var(--success))]",
    },
    {
      label: "Events This Month",
      value: kpis.data?.eventsThisMonth ?? 0,
      glyph: "📊",
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
  }));

  const feedEvents: FeedEvent[] = recent.data ?? [];

  const activePatrols: ActivePatrol[] = (patrols.data?.items ?? []).map((p) => ({
    id: p.id,
    patrolType: p.patrolType,
    areaName: p.areaName,
    startTime: p.startTime,
    totalDistanceKm: p.totalDistanceKm,
    computedDistanceKm: p.computedDistanceKm,
    leaderName: p.segments[0]?.leaderName ?? p.title ?? null,
  }));

  const incident: LastIncident = lastIncident.data ?? null;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <h1 className="sr-only">Command Center — War Room</h1>

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
              barClass="bg-destructive"
            />
            <BreakdownBars
              title="Monitoring"
              data={breakdown.data?.monitoring ?? []}
              barClass="bg-[hsl(var(--success))]"
            />
            <LastIncidentCard incident={incident} now={nowValue} />
          </div>
        </div>

        {/* Alerts / patrols / feed zone */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <AlertsPanel
            alerts={alertItems}
            isLoading={alerts.isLoading}
            now={nowValue}
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
