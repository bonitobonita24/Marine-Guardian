"use client";

/**
 * Protected zone coverage card — WAR ROOM section.
 *
 * Simple list card showing patrol + event activity in each protected zone
 * over the last 30 days. Apo Reef Natural Park is always shown first.
 *
 * Matches the Card shell pattern used by BreakdownBars and MunicipalityCoverageChart.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ProtectedZoneDatum {
  zone: string;
  parentMunicipality: string | null;
  patrolCount: number;
  eventCount: number;
}

const HEADING_ID = "protected-zone-heading";

/** Returns Apo Reef first, then alphabetical. */
function sortZones(zones: ProtectedZoneDatum[]): ProtectedZoneDatum[] {
  return [...zones].sort((a, b) => {
    const aIsApo = a.zone.toLowerCase().includes("apo reef");
    const bIsApo = b.zone.toLowerCase().includes("apo reef");
    if (aIsApo && !bIsApo) return -1;
    if (!aIsApo && bIsApo) return 1;
    return a.zone.localeCompare(b.zone);
  });
}

export function ProtectedZoneCard({
  zones,
  isLoading,
}: {
  zones: ProtectedZoneDatum[];
  isLoading: boolean;
}) {
  const sorted = sortZones(zones);

  return (
    <Card
      aria-labelledby={HEADING_ID}
      className="min-w-0 flex-1 gap-2 border-border py-3"
    >
      <CardHeader className="px-3 pb-0 pt-0">
        <div className="flex items-center justify-between">
          <h3
            id={HEADING_ID}
            className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Protected Zones
          </h3>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            30 days
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-1 pt-0">
        {isLoading ? (
          <p className="py-3 text-[10px] text-muted-foreground">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="py-3 text-[10px] text-muted-foreground">No protected zones</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2">
            {sorted.map((z) => (
              <li key={z.zone} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-foreground leading-tight">
                    {z.zone}
                  </p>
                  {z.parentMunicipality != null && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {z.parentMunicipality}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge
                    variant="secondary"
                    className="h-4 px-1 py-0 text-[9px] tabular-nums"
                    title={`${String(z.patrolCount)} patrol(s)`}
                  >
                    {z.patrolCount}P
                  </Badge>
                  <Badge
                    variant="outline"
                    className="h-4 px-1 py-0 text-[9px] tabular-nums"
                    title={`${String(z.eventCount)} event(s)`}
                  >
                    {z.eventCount}E
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
