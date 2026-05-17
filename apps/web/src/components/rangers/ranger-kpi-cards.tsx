import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PatrolKpi {
  count: number;
  km: number;
  hours: number;
}

interface RangerKpiCardsProps {
  patrolStats: {
    foot: PatrolKpi;
    sea: PatrolKpi;
  };
}

function formatKm(km: number): string {
  if (km === 0) return "0";
  if (km < 10) return km.toFixed(1);
  return Math.round(km).toString();
}

function formatHours(hours: number): string {
  if (hours === 0) return "0";
  if (hours < 10) return hours.toFixed(1);
  return Math.round(hours).toString();
}

interface KpiBlockProps {
  label: string;
  value: string;
  unit?: string;
}

function KpiBlock({ label, value, unit }: KpiBlockProps) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        {unit !== undefined && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

interface PatrolKpiCardProps {
  title: string;
  stats: PatrolKpi;
}

function PatrolKpiCard({ title, stats }: PatrolKpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        <KpiBlock label="Patrols" value={stats.count.toString()} />
        <KpiBlock label="Distance" value={formatKm(stats.km)} unit="km" />
        <KpiBlock label="Hours" value={formatHours(stats.hours)} unit="hrs" />
      </CardContent>
    </Card>
  );
}

export function RangerKpiCards({ patrolStats }: RangerKpiCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PatrolKpiCard title="Foot patrol" stats={patrolStats.foot} />
      <PatrolKpiCard title="Seaborne patrol" stats={patrolStats.sea} />
    </div>
  );
}
