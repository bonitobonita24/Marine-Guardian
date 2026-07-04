"use client";

import { useEffect, useRef } from "react";
import { MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  PatrolTypeIcon,
  formatPatrolCoords,
  formatPatrolDateTime,
  formatPatrolHours,
  patrolTypeLabel,
  type RangePatrol,
} from "./patrol-list-by-range-card";

/**
 * Interactive Report Map — floating selected-patrol panel (2026-07-03). Overlaid
 * on the map's upper-RIGHT (via InteractiveMap's topRightSlot, symmetric with
 * the floating controls card on the left), it carries the full detail of the
 * patrol selected in the "Patrols" list — the strip that used to render inline
 * inside PatrolListByRangeCard. Rendered only while a patrol is selected.
 * Dismissed by the X button, the Escape key, or a click on the empty basemap
 * (background-click deselect wired in report-map-view).
 */
export function SelectedPatrolMapPanel({
  patrol,
  onClose,
}: {
  patrol: RangePatrol;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // WCAG: move focus into the panel when it appears so keyboard users land on
  // the detail they just requested (the close button is one Tab away).
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Esc dismisses the panel wherever focus currently is. Radix dialogs (the
  // event-detail modal) preventDefault the Escape they consume — the guard
  // keeps a single Esc from closing both surfaces at once.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const km = patrol.computedDistanceKm ?? patrol.totalDistanceKm;
  const hours = patrol.computedDurationHours ?? patrol.totalHours;
  const startCoords = formatPatrolCoords(
    patrol.startLocationLat,
    patrol.startLocationLon,
  );
  const endCoords = formatPatrolCoords(
    patrol.endLocationLat,
    patrol.endLocationLon,
  );

  return (
    <Card
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label="Selected patrol details"
      className="gap-0 border-primary/40 bg-background/95 py-0 shadow-md backdrop-blur focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <CardHeader className="flex flex-row items-center gap-1.5 space-y-0 border-b px-3 py-2">
        <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          {patrol.title ?? "Untitled patrol"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close patrol details"
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </CardHeader>
      <CardContent className="space-y-1 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="gap-1 px-1.5 py-0.5 text-[9px] font-medium text-foreground/85"
          >
            <PatrolTypeIcon type={patrol.patrolType} className="size-3" />
            {patrolTypeLabel(patrol.patrolType)}
          </Badge>
          {patrol.serialNumber != null && patrol.serialNumber !== "" && (
            <span className="text-[9px] tabular-nums text-muted-foreground">
              ER #{patrol.serialNumber}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {patrol.leaderName != null && <span>{patrol.leaderName}</span>}
          {patrol.boatName != null && patrol.boatName !== "" && (
            <span>· {patrol.boatName}</span>
          )}
          {km != null && <span>· {km.toFixed(1)} km</span>}
          <span>· {formatPatrolHours(hours)}</span>
        </div>
        <div className="text-[10px] tabular-nums text-muted-foreground">
          {formatPatrolDateTime(patrol.startTime)} →{" "}
          {formatPatrolDateTime(patrol.endTime)}
        </div>
        <div className="text-[10px] tabular-nums text-muted-foreground">
          Start: {startCoords}
        </div>
        <div className="text-[10px] tabular-nums text-muted-foreground">
          End: {endCoords}
        </div>
      </CardContent>
    </Card>
  );
}
