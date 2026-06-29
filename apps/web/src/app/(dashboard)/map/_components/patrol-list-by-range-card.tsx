"use client";

import { Route, Footprints, Ship, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Interactive Report Map — "Patrols in range" list (owner request 2026-06-29).
 * Replaces the Events Over Time card slot (that chart moves to its own full-width
 * row below). Lists every patrol whose start falls in the selected date range +
 * municipality/zone scope (reportMap.patrolsInRange), showing whose patrol it is
 * (segment leader) and when it started / finished. Selecting a row tells the map
 * to draw that patrol's track (and fly to it) and reveals the patrol's full
 * details — including its EarthRanger title — in the strip at the top.
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
  startLocationLat: number | null;
  startLocationLon: number | null;
  leaderName: string | null;
  leaders: string[];
};

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value: Date | string | null): string {
  const d = toDate(value);
  if (d === null) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function patrolTypeLabel(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function PatrolTypeIcon({ type, className }: { type: string; className?: string }) {
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
}: {
  patrols: RangePatrol[];
  isLoading: boolean;
  selectedPatrolId: string | null;
  /** Select a patrol → map draws + flies to its track; detail strip updates. */
  onSelect: (patrol: RangePatrol) => void;
}) {
  const selected = patrols.find((p) => p.id === selectedPatrolId) ?? null;

  return (
    <Card className="flex h-full min-w-0 flex-1 flex-col gap-2 border-border py-2">
      <CardHeader className="flex flex-row items-stretch justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
          <Route className="size-3.5 shrink-0 text-foreground/70" aria-hidden="true" />
          <h3 className="min-w-0 flex-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-foreground/85">
            Patrols
          </h3>
        </div>
        <div className="w-px shrink-0 self-stretch bg-border" aria-hidden="true" />
        <span className="shrink-0 self-center text-sm font-bold tabular-nums">
          {patrols.length.toLocaleString()}
        </span>
      </CardHeader>

      {/* Selected-patrol detail strip — its full data incl. ER title. */}
      {selected !== null && (
        <div className="mx-2 rounded border border-primary/40 bg-primary/5 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
              {selected.title ?? "Untitled patrol"}
            </span>
            {selected.serialNumber != null && selected.serialNumber !== "" && (
              <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                ER #{selected.serialNumber}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
            <span>{patrolTypeLabel(selected.patrolType)}</span>
            {selected.leaderName != null && <span>· {selected.leaderName}</span>}
            {selected.boatName != null && selected.boatName !== "" && (
              <span>· {selected.boatName}</span>
            )}
            {(() => {
              const km = selected.computedDistanceKm ?? selected.totalDistanceKm;
              return km != null ? <span>· {km.toFixed(1)} km</span> : null;
            })()}
          </div>
          <div className="mt-0.5 text-[9px] tabular-nums text-muted-foreground">
            {formatDateTime(selected.startTime)} → {formatDateTime(selected.endTime)}
          </div>
        </div>
      )}

      <CardContent className="relative min-h-0 flex-1 px-0 pb-1 pt-0">
        {isLoading ? (
          <p className="px-3 py-3 text-[10px] text-muted-foreground">Loading…</p>
        ) : patrols.length === 0 ? (
          <p className="px-3 py-3 text-[10px] text-muted-foreground">
            No patrols in this range.
          </p>
        ) : (
          <ul className="absolute inset-0 overflow-y-auto">
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
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                      {who}
                    </span>
                    <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                      {formatDateTime(p.startTime)}
                      {" → "}
                      {formatDateTime(p.endTime)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
