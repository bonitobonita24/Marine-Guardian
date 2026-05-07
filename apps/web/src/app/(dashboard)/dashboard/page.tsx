"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc/client";

const lawEnforcementChartConfig = {
  count: { label: "Events", color: "hsl(var(--destructive))" },
} satisfies ChartConfig;

const monitoringChartConfig = {
  count: { label: "Events", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

function KpiCard({
  title,
  value,
  delta,
  deltaLabel,
}: {
  title: string;
  value: number;
  delta?: number;
  deltaLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {delta !== undefined && deltaLabel !== undefined && (
          <p
            className={`mt-1 text-xs ${delta > 0 ? "text-[hsl(var(--destructive))]" : delta < 0 ? "text-[hsl(var(--success))]" : "text-muted-foreground"}`}
          >
            {delta > 0 ? "+" : ""}
            {delta} {deltaLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function priorityVariant(priority: number) {
  if (priority >= 3) return "destructive" as const;
  if (priority === 2) return "default" as const;
  return "secondary" as const;
}

function priorityLabel(priority: number) {
  if (priority >= 3) return "Critical";
  if (priority === 2) return "High";
  if (priority === 1) return "Medium";
  return "Low";
}

function stateColor(state: string) {
  switch (state) {
    case "new_event":
      return "text-[hsl(var(--caution))]";
    case "active":
      return "text-[hsl(var(--info))]";
    case "resolved":
      return "text-[hsl(var(--success))]";
    default:
      return "text-muted-foreground";
  }
}

export default function DashboardPage() {
  const kpis = trpc.dashboard.kpis.useQuery();
  const breakdown = trpc.dashboard.eventBreakdown.useQuery();
  const recent = trpc.dashboard.recentEvents.useQuery();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Command Center</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Active Events"
          value={kpis.data?.activeEvents ?? 0}
        />
        <KpiCard
          title="Active Patrols"
          value={kpis.data?.activePatrols ?? 0}
        />
        <KpiCard
          title="Rangers on Duty"
          value={kpis.data?.rangersOnDuty ?? 0}
        />
        {kpis.data ? (
          <KpiCard
            title="Events This Month"
            value={kpis.data.eventsThisMonth}
            delta={kpis.data.eventsThisMonth - kpis.data.eventsLastMonth}
            deltaLabel="vs last month"
          />
        ) : (
          <KpiCard
            title="Events This Month"
            value={0}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Law Enforcement Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.data !== undefined &&
            breakdown.data.lawEnforcement.length > 0 ? (
              <ChartContainer
                config={lawEnforcementChartConfig}
                className="h-[250px] w-full"
              >
                <BarChart
                  data={breakdown.data.lawEnforcement}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <YAxis
                    dataKey="type"
                    type="category"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <XAxis type="number" hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No law enforcement events recorded
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Monitoring &amp; Surveillance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.data !== undefined &&
            breakdown.data.monitoring.length > 0 ? (
              <ChartContainer
                config={monitoringChartConfig}
                className="h-[250px] w-full"
              >
                <BarChart
                  data={breakdown.data.monitoring}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <YAxis
                    dataKey="type"
                    type="category"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <XAxis type="number" hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No monitoring events recorded
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.data !== undefined && recent.data.length > 0 ? (
              <div className="space-y-3">
                {recent.data.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {event.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event.eventType?.display ?? "Unknown type"} &middot;{" "}
                        {event.reportedAt
                          ? new Date(event.reportedAt).toLocaleDateString()
                          : "Unknown date"}
                      </p>
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      <span
                        className={`text-xs font-medium capitalize ${stateColor(event.state)}`}
                      >
                        {event.state.replace("_", " ")}
                      </span>
                      <Badge variant={priorityVariant(event.priority)}>
                        {priorityLabel(event.priority)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No events recorded yet
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Law Enforcement
              </span>
              <span className="text-lg font-semibold text-[hsl(var(--destructive))]">
                {breakdown.data?.lawEnforcement.reduce(
                  (sum, e) => sum + e.count,
                  0
                ) ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Monitoring</span>
              <span className="text-lg font-semibold text-[hsl(var(--primary))]">
                {breakdown.data?.monitoring.reduce(
                  (sum, e) => sum + e.count,
                  0
                ) ?? 0}
              </span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Total Events
              </span>
              <span className="text-lg font-semibold">
                {(breakdown.data?.lawEnforcement.reduce(
                  (sum, e) => sum + e.count,
                  0
                ) ?? 0) +
                  (breakdown.data?.monitoring.reduce(
                    (sum, e) => sum + e.count,
                    0
                  ) ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
