"use client";

/**
 * Protected zone coverage card — WAR ROOM section.
 *
 * Simple list card showing patrol + event activity in each protected zone
 * over the last 30 days. Apo Reef Natural Park is always shown first.
 *
 * Matches the Card shell pattern used by BreakdownBars and MunicipalityCoverageChart.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  rangeLabel,
}: {
  zones: ProtectedZoneDatum[];
  isLoading: boolean;
  /** Active War Room range label (e.g. "Jun 19 – Jun 26"). */
  rangeLabel: string;
}) {
  const sorted = sortZones(zones);

  // Coverage % headline (client-derived, no extra query): share of protected
  // zones that saw at least one patrol within the active range. Honest 0% when
  // there are no zones. NOTE: this is coverage-presence, not response-time —
  // response-time is intentionally deferred until a resolution timestamp exists.
  const patrolledCount = sorted.filter((z) => z.patrolCount > 0).length;
  const coveragePct =
    sorted.length > 0
      ? Math.round((patrolledCount / sorted.length) * 100)
      : 0;

  return (
    <Card
      aria-labelledby={HEADING_ID}
      className="min-w-0 flex-1 gap-2 border-border py-3"
    >
      <CardHeader className="px-3 pb-0 pt-0">
        <div className="flex items-center justify-between">
          <CardTitle
            id={HEADING_ID}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Protected Zones
          </CardTitle>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {rangeLabel}
          </span>
        </div>
        {sorted.length > 0 && (
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold tabular-nums text-[hsl(var(--info))]">
              {coveragePct}%
            </span>
            <span className="text-xs text-muted-foreground">
              patrolled ({patrolledCount}/{sorted.length} zones)
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-3 pb-1 pt-0">
        {isLoading ? (
          <p className="py-3 text-xs text-muted-foreground">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">No protected zones</p>
        ) : (
          // Bounded + internally scrollable (hidden bar via .command-center CSS)
          // so the card stays a fixed height as more MPAs/zones are added — the
          // extra rows scroll into view instead of growing the card. (2026-06-27)
          <div className="max-h-32 overflow-y-auto pb-2">
          <ul className="mt-1 flex flex-col gap-2 pr-1">
            {sorted.map((z) => (
              <li key={z.zone} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground leading-tight">
                    {z.zone}
                  </p>
                  {z.parentMunicipality != null && (
                    <p className="truncate text-xs text-muted-foreground">
                      {z.parentMunicipality}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge
                    variant="secondary"
                    className="h-4 px-1 py-0 text-xs tabular-nums"
                    title={`${String(z.patrolCount)} patrol(s)`}
                  >
                    {z.patrolCount}P
                  </Badge>
                  <Badge
                    variant="outline"
                    className="h-4 px-1 py-0 text-xs tabular-nums"
                    title={`${String(z.eventCount)} event(s)`}
                  >
                    {z.eventCount}E
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
