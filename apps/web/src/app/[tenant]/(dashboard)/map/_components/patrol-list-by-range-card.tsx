"use client";

import { Route, Footprints, Ship } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Interactive Report Map — "Patrols in range" list (owner request 2026-06-29).
 * Replaces the Events Over Time card slot (that chart moves to its own full-width
 * row below). Lists every patrol whose start falls in the selected date range +
 * municipality/zone scope (reportMap.patrolsInRange), showing whose patrol it is
 * (segment leader) and when it started / finished. Selecting a row tells the map
 * to isolate + fly to that patrol's track and opens the patrol's full details —
 * including its EarthRanger title — in the floating panel on the map's
 * upper-right (SelectedPatrolMapPanel, 2026-07-03; formerly an inline strip
 * at the top of this card). The row keeps its selected highlight.
 */

export type RangePatrol = {
  id: string;
  title: string | null;
  serialNumber: string | null;
  patrolType: string;
  boatName: string | null;
  startTime: Date | string | null;
  endTime: Date | string | null;
  totalDistanceKm: number | null;
  computedDistanceKm: number | null;
  totalHours: number | null;
  computedDurationHours: number | null;
  startLocationLat: number | null;
  startLocationLon: number | null;
  endLocationLat: number | null;
  endLocationLon: number | null;
  leaderName: string | null;
  leaders: string[];
};

/** Shared with SelectedPatrolMapPanel — "Xh YYm" duration string, or "—" when
 *  no hours figure is available. */
export function formatPatrolHours(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) return "—";
  const totalMin = Math.round(hours * 60);
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${String(hr)}h ${String(min).padStart(2, "0")}m`;
}

/** Shared with SelectedPatrolMapPanel — signed lat/lon pair formatted to 4
 *  decimals with N/S · E/W suffixes, or "—" when either coordinate is null. */
export function formatPatrolCoords(
  lat: number | null,
  lon: number | null,
): string {
  if (lat === null || lon === null) return "—";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shared with SelectedPatrolMapPanel — the floating detail panel renders the
 *  same start → end datetimes as the list rows. */
export function formatPatrolDateTime(value: Date | string | null): string {
  const d = toDate(value);
  if (d === null) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Shared with SelectedPatrolMapPanel (patrol-type badge label). */
export function patrolTypeLabel(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Shared with SelectedPatrolMapPanel (patrol-type badge icon). */
export function PatrolTypeIcon({ type, className }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  if (t.includes("foot") || t.includes("land")) return <Footprints className={className} />;
  if (t.includes("sea") || t.includes("boat") || t.includes("marine")) return <Ship className={className} />;
  return <Route className={className} />;
}

export function PatrolListByRangeCard({
  patrols,
  isLoading,
  selectedPatrolId,
  onSelect,
  totalCount,
}: {
  patrols: RangePatrol[];
  isLoading: boolean;
  selectedPatrolId: string | null;
  /** Select a patrol → map isolates + flies to its track; the floating
   *  selected-patrol panel (upper-right of the map) shows its detail. */
  onSelect: (patrol: RangePatrol) => void;
  /**
   * Uncapped total patrol count for the active filter (reportMap.summary,
   * `patrolWhere`-identical to the list query) — `patrolsInRange` is capped
   * at 300 rows server-side, so the badge would otherwise max out at 300
   * even when more patrols actually match. Undefined while the summary
   * query is loading — falls back to `patrols.length` so the badge never
   * flickers to a wrong number.
   */
  totalCount?: number | undefined;
}) {
  const trueTotal = totalCount ?? patrols.length;
  const isTruncated = totalCount !== undefined && totalCount > patrols.length;
  return (
    <Card className="flex h-full min-w-0 flex-1 flex-col gap-2 border-border py-2">
      <CardHeader className="flex flex-row items-stretch justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
          <Route className="size-3.5 shrink-0 text-foreground/70" aria-hidden="true" />
          <CardTitle className="min-w-0 flex-1 text-xs uppercase leading-tight tracking-wide text-foreground/85">
            Patrols
          </CardTitle>
        </div>
        <div className="w-px shrink-0 self-stretch bg-border" aria-hidden="true" />
        <Badge variant="secondary" className="shrink-0 self-center tabular-nums">
          {trueTotal.toLocaleString()}
        </Badge>
      </CardHeader>

      <CardContent className="relative min-h-0 flex-1 px-0 pb-1 pt-0">
        {isLoading ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : patrols.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            No patrols in this range.
          </p>
        ) : (
          <div className="absolute inset-0 flex flex-col">
            {isTruncated ? (
              <p className="shrink-0 px-3 pb-1 pt-1.5 text-xs text-muted-foreground">
                Showing {patrols.length.toLocaleString()} of{" "}
                {totalCount.toLocaleString()}
              </p>
            ) : null}
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {patrols.map((p) => {
                const isSel = p.id === selectedPatrolId;
                const who = p.leaderName ?? p.boatName ?? "Unnamed patrol";
                return (
                  <li
                    key={p.id}
                    className={`border-b border-border/40 ${isSel ? "bg-primary/10" : "hover:bg-muted/30"}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(p);
                      }}
                      className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <PatrolTypeIcon
                        type={p.patrolType}
                        className="size-4 shrink-0 text-foreground/60"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {who}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatPatrolDateTime(p.startTime)}
                        {" → "}
                        {formatPatrolDateTime(p.endTime)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
