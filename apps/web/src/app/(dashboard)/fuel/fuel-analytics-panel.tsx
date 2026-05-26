"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc/client";
import type { FuelPeriodGrain } from "@marine-guardian/shared/schemas";

const PERIOD_GRAIN_OPTIONS: { value: FuelPeriodGrain; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Annually" },
];

const chartConfig = {
  litersPerKm: {
    label: "L/km",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

/** Default date range: 90 days ending today (UTC midnight). */
function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 90);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function formatNumber(n: number, fractionDigits: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatCurrency(n: number, currency: string): string {
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${formatNumber(n, 2)}`;
  }
}

/**
 * Fuel consumption analytics panel — PRODUCT.md §121-127.
 *
 * Period selector (5 grains), area filter (single or all), date range,
 * KPI cards (totalLiters / totalCost / totalSeabornePatrolKm / avg L/km),
 * trend line (litersPerKm over bucket), per-area breakdown table.
 *
 * Calls fuelEntry.consumptionAnalytics. Invalidation on Create/Edit/Delete
 * is wired in the respective dialogs.
 */
export function FuelAnalyticsPanel() {
  const initialRange = useMemo(defaultDateRange, []);
  const [periodGrain, setPeriodGrain] = useState<FuelPeriodGrain>("month");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [dateFromRaw, setDateFromRaw] = useState<string>(initialRange.from);
  const [dateToRaw, setDateToRaw] = useState<string>(initialRange.to);

  const areasQuery = trpc.areaBoundary.list.useQuery({
    limit: 200,
    isEnabled: true,
  });
  const areaOptions = useMemo(() => {
    const items = areasQuery.data?.items ?? [];
    return items.map((a) => ({ id: a.id, name: a.name }));
  }, [areasQuery.data]);

  // Build the analytics query input — guard against unparseable dates so a
  // half-typed input doesn't crash the panel mid-edit.
  const analyticsInput = useMemo(() => {
    const from = new Date(dateFromRaw);
    const to = new Date(dateToRaw);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      return null;
    }
    return {
      ...(areaFilter !== "all" ? { areaBoundaryIds: [areaFilter] } : {}),
      dateFrom: from,
      dateTo: to,
      periodGrain,
    };
  }, [dateFromRaw, dateToRaw, areaFilter, periodGrain]);

  const analyticsQuery = trpc.fuelEntry.consumptionAnalytics.useQuery(
    analyticsInput ?? {
      dateFrom: new Date(),
      dateTo: new Date(),
      periodGrain: "month",
    },
    { enabled: analyticsInput !== null },
  );

  const data = analyticsQuery.data;
  const currency = data?.summary.currency ?? "PHP";
  const trendData = useMemo(() => {
    if (data === undefined) return [];
    return data.trend.map((b) => ({
      bucket: b.bucket,
      litersPerKm: b.litersPerKm ?? 0,
      liters: b.liters,
      seabornePatrolKm: b.seabornePatrolKm,
    }));
  }, [data]);

  return (
    <Card data-testid="fuel-analytics-panel">
      <CardHeader>
        <CardTitle>Consumption analytics</CardTitle>
        <CardDescription>
          Average fuel consumption rate = total liters received ÷ total
          seaborne patrol kilometers in the selected window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label
              htmlFor="fuel-analytics-period"
              className="text-xs text-muted-foreground"
            >
              Period
            </Label>
            <Select
              value={periodGrain}
              onValueChange={(v) => {
                setPeriodGrain(v as FuelPeriodGrain);
              }}
            >
              <SelectTrigger
                id="fuel-analytics-period"
                data-testid="fuel-analytics-period"
                className="w-[140px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_GRAIN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="fuel-analytics-area"
              className="text-xs text-muted-foreground"
            >
              Area
            </Label>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger
                id="fuel-analytics-area"
                data-testid="fuel-analytics-area"
                className="w-[180px]"
              >
                <SelectValue placeholder="All areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {areaOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="fuel-analytics-from"
              className="text-xs text-muted-foreground"
            >
              From
            </Label>
            <Input
              id="fuel-analytics-from"
              data-testid="fuel-analytics-from"
              type="date"
              value={dateFromRaw}
              onChange={(e) => {
                setDateFromRaw(e.target.value);
              }}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="fuel-analytics-to"
              className="text-xs text-muted-foreground"
            >
              To
            </Label>
            <Input
              id="fuel-analytics-to"
              data-testid="fuel-analytics-to"
              type="date"
              value={dateToRaw}
              onChange={(e) => {
                setDateToRaw(e.target.value);
              }}
              className="w-[160px]"
            />
          </div>
        </div>

        {analyticsInput === null && (
          <p className="text-sm text-muted-foreground">
            Pick a valid date range to see analytics.
          </p>
        )}

        {analyticsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {data !== undefined && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                testId="fuel-kpi-liters"
                label="Total liters"
                value={formatNumber(data.summary.totalLiters, 3)}
              />
              <KpiCard
                testId="fuel-kpi-cost"
                label="Total cost"
                value={formatCurrency(data.summary.totalCost, currency)}
              />
              <KpiCard
                testId="fuel-kpi-seaborne-km"
                label="Seaborne km"
                value={formatNumber(data.summary.totalSeabornePatrolKm, 1)}
              />
              <KpiCard
                testId="fuel-kpi-avg-lpkm"
                label="Avg L/km"
                value={
                  data.summary.averageLitersPerKm === null
                    ? "N/A"
                    : formatNumber(data.summary.averageLitersPerKm, 3)
                }
              />
            </div>

            {/* Trend */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">L/km trend</h3>
              {trendData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No data in selected window.
                </p>
              ) : (
                <ChartContainer
                  config={chartConfig}
                  className="h-[260px] w-full"
                >
                  <LineChart
                    data={trendData}
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bucket"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      dataKey="litersPerKm"
                      type="monotone"
                      stroke="var(--color-litersPerKm)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </div>

            {/* Per-area breakdown */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Per-area breakdown</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Area</TableHead>
                      <TableHead className="text-right">Liters</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Seaborne km</TableHead>
                      <TableHead className="text-right">L/km</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perArea.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground"
                        >
                          No data in selected window.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.perArea.map((row) => (
                        <TableRow
                          key={row.areaBoundaryId ?? `__unallocated__`}
                          data-testid={`fuel-perarea-${row.areaBoundaryId ?? "unallocated"}`}
                        >
                          <TableCell>{row.areaName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(row.liters, 3)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.cost, currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(row.seabornePatrolKm, 1)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.litersPerKm === null
                              ? "N/A"
                              : formatNumber(row.litersPerKm, 3)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.entryCount}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  testId: string;
}

function KpiCard({ label, value, testId }: KpiCardProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-md border bg-card p-3 shadow-sm"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
