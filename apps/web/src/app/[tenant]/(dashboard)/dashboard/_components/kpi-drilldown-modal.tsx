"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc/client";
import type { KpiDrilldown } from "./kpi-strip";
import { patrolTypeMeta } from "./lib";

/**
 * WAR ROOM KPI drill-down modal (T5b).
 *
 * Opened when an operator clicks a list-backed KPI tile. Lists the underlying
 * in-range records by re-using the existing `event.list` / `patrol.list`
 * procedures with the active FROM/TO range + the matching filter:
 *   - activeEvents    → event.list  { state: "active", dateFrom, dateTo, linkedToActivePatrol: true }
 *   - eventsThisMonth → event.list  { dateFrom: monthStart, dateTo: now }
 *   - activePatrols   → patrol.list { state: "open" }
 * No new tRPC procedure is introduced.
 */
export function KpiDrilldownModal({
  drilldown,
  dateFrom,
  dateTo,
  onClose,
}: {
  /** The selected KPI descriptor, or null when the modal is closed. */
  drilldown: KpiDrilldown | null;
  /** Active War Room range start (ISO). */
  dateFrom: string;
  /** Active War Room range end (ISO). */
  dateTo: string;
  onClose: () => void;
}) {
  const kind = drilldown?.kind ?? null;
  // This modal handles the three list-backed KPI kinds. "rangersOnDuty" is a
  // richer two-pane (list + map) drill-down rendered by its own dedicated modal
  // (RangersOnDutyDrilldownModal), which shares the same selectedKpi state — so
  // this modal must stay CLOSED for that kind or both dialogs would open at once.
  const open =
    kind === "activeEvents" ||
    kind === "activePatrols" ||
    kind === "eventsThisMonth";

  // "Events This Month" drills into the calendar month containing `dateTo`,
  // independent of the active War Room window (the KPI itself is month-scoped).
  const monthAnchor = new Date(dateTo);
  const monthStart = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1,
  ).toISOString();

  const eventsQuery = trpc.event.list.useQuery(
    kind === "eventsThisMonth"
      ? { dateFrom: monthStart, dateTo, limit: 100 }
      // event-patrol-link — restrict Active Events to events tied to an
      // open patrol (see event.ts eventListFilters.linkedToActivePatrol).
      : { state: "active", dateFrom, dateTo, linkedToActivePatrol: true, limit: 100 },
    { enabled: open && (kind === "activeEvents" || kind === "eventsThisMonth") },
  );

  const patrolsQuery = trpc.patrol.list.useQuery(
    { state: "open", limit: 100 },
    { enabled: open && kind === "activePatrols" },
  );

  const meta = ((): { title: string; description: string } => {
    switch (kind) {
      case "activeEvents":
        return {
          title: "Active Events",
          description: "Active events in the selected War Room window.",
        };
      case "eventsThisMonth":
        return {
          title: "Events This Month",
          description: "Events reported in the current calendar month.",
        };
      case "activePatrols":
        return {
          title: "Active Patrols",
          description: "Patrols currently open.",
        };
      default:
        return { title: "Details", description: "" };
    }
  })();

  const isPatrols = kind === "activePatrols";
  const isLoading = isPatrols ? patrolsQuery.isLoading : eventsQuery.isLoading;
  const events = eventsQuery.data?.items ?? [];
  const patrols = patrolsQuery.data?.items ?? [];
  const empty = isPatrols ? patrols.length === 0 : events.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : empty ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {isPatrols ? "No active patrols." : "No events in range."}
            </p>
          ) : isPatrols ? (
            <ul className="divide-y divide-border">
              {patrols.map((p) => {
                const t = patrolTypeMeta(p.patrolType);
                return (
                  <li key={p.id} className="flex flex-col gap-0.5 py-2 text-sm">
                    <span className="font-medium">{p.title ?? "Untitled patrol"}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.label}
                      {" · "}
                      {p.areaName ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev) => (
                <li key={ev.id} className="flex flex-col gap-0.5 py-2 text-sm">
                  <span className="font-medium">{ev.title ?? "Untitled event"}</span>
                  <span className="text-xs text-muted-foreground">
                    {ev.areaName ?? "—"}
                    {" · "}
                    {ev.reportedAt === null
                      ? "—"
                      : new Date(ev.reportedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
