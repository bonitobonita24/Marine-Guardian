"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InteractiveMap } from "@/components/map/InteractiveMap";
import { trpc } from "@/lib/trpc/client";

/**
 * WAR ROOM "Rangers on Duty" drill-down (2026-07-13).
 *
 * Opened when the operator clicks the "Rangers on Duty" KPI tile. Two panes:
 *   LEFT  — one row per currently-open patrol with personnel on it: the MAIN
 *           ranger (patrol lead) with that patrol's accompanying rangers nested
 *           underneath. Clicking a row focuses the map on that patrol's track.
 *   RIGHT — the selected lead's FULL current-patrol track, drawn by reusing
 *           InteractiveMap in the same controlled-selection mode the Interactive
 *           Report Map uses (trackMode="active" + selectedPatrolId).
 *
 * Data: dashboard.rangersOnDuty (its `count` mirrors the KPI tile's value via the
 * shared knownRangerIdsLeadingSegments helper — header and tile never disagree).
 *
 * Shares the dashboard's single `selectedKpi` state with KpiDrilldownModal, which
 * deliberately stays closed for the "rangersOnDuty" kind so only this modal opens.
 */
export function RangersOnDutyDrilldownModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const query = trpc.dashboard.rangersOnDuty.useQuery(undefined, {
    enabled: open,
  });
  const rangers = query.data?.rangers ?? [];
  const count = query.data?.count ?? 0;

  // Which patrol's track the right-pane map is drawing.
  const [selectedPatrolId, setSelectedPatrolId] = useState<string | null>(null);

  // Reset the selection whenever the dialog closes so a re-open starts clean.
  useEffect(() => {
    if (!open) setSelectedPatrolId(null);
  }, [open]);

  // Auto-focus the first ranger that has a track once data lands (so the map
  // pane isn't blank on open when at least one patrol is trackable).
  useEffect(() => {
    if (!open || selectedPatrolId !== null) return;
    const firstWithTrack = rangers.find((r) => r.hasTrack);
    if (firstWithTrack !== undefined) setSelectedPatrolId(firstWithTrack.patrolId);
  }, [open, rangers, selectedPatrolId]);

  const selected =
    rangers.find((r) => r.patrolId === selectedPatrolId) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex h-[80vh] max-h-[85vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Rangers on Duty</DialogTitle>
          <DialogDescription>
            {count} ranger{count === 1 ? "" : "s"} on currently-open patrols —
            each patrol lead with any accompanying rangers, and the lead&apos;s
            live patrol track.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* LEFT — leaders + nested accompanying rangers. */}
          <div className="w-72 shrink-0 border-r border-border">
            <ScrollArea className="h-full">
              {query.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </p>
              ) : rangers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No rangers on duty.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {rangers.map((r) => {
                    const isSelected = r.patrolId === selectedPatrolId;
                    return (
                      <li key={r.patrolId}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setSelectedPatrolId(r.patrolId);
                          }}
                          className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                            isSelected ? "bg-muted" : "hover:bg-muted/50"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <Users
                              className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]"
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              {r.leaderName ?? "Unassigned lead"}
                            </span>
                            {!r.hasTrack && (
                              <span className="ml-auto shrink-0 rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                no track
                              </span>
                            )}
                          </span>
                          {r.patrolTitle !== null && (
                            <span className="truncate text-xs text-muted-foreground">
                              {r.patrolTitle}
                            </span>
                          )}
                          {r.accompanying.length > 0 && (
                            <ul className="mt-0.5 space-y-0.5 pl-5">
                              {r.accompanying.map((name, i) => (
                                <li
                                  key={`${r.patrolId}-acc-${String(i)}`}
                                  className="truncate text-xs text-muted-foreground before:mr-1 before:content-['•']"
                                >
                                  {name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* RIGHT — selected lead's current-patrol track. */}
          <div className="relative min-h-0 flex-1">
            {selectedPatrolId !== null && selected?.hasTrack === true ? (
              <InteractiveMap
                // Remount per selection so the map re-frames on the newly
                // chosen patrol's track (and re-measures its container).
                key={selectedPatrolId}
                className="h-full w-full"
                trackMode="active"
                selectedPatrolId={selectedPatrolId}
                hideSubjects
                hidePatrolSelector
                controlsPlacement="floating"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {selected === null
                  ? "Select a ranger to view their patrol track."
                  : "No GPS track recorded for this patrol yet."}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
