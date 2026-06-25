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

/**
 * WAR ROOM breakdown drill-down modal (T5b).
 *
 * Opened when an operator clicks a bar in the Law Enforcement / Monitoring
 * breakdown chart. Lists the events of exactly that event type
 * (eventType.display) within the active FROM/TO range, by re-using the existing
 * `event.list` procedure with the new `typeDisplay` + dateFrom/dateTo filters.
 * No new tRPC procedure is introduced.
 */
export function BreakdownDrilldownModal({
  typeDisplay,
  dateFrom,
  dateTo,
  onClose,
}: {
  /** The selected eventType.display, or null when the modal is closed. */
  typeDisplay: string | null;
  /** Active range start (ISO) — threaded from the War Room range context. */
  dateFrom: string;
  /** Active range end (ISO). */
  dateTo: string;
  onClose: () => void;
}) {
  const open = typeDisplay !== null;

  const query = trpc.event.list.useQuery(
    { typeDisplay: typeDisplay ?? "", dateFrom, dateTo, limit: 100 },
    { enabled: open },
  );

  const items = query.data?.items ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg">
        <DialogHeader>
          <DialogTitle>{typeDisplay ?? "Events"}</DialogTitle>
          <DialogDescription>
            Events of this type in the selected War Room window.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {query.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading events…
            </p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No events of this type in range.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((ev) => (
                <li key={ev.id} className="flex flex-col gap-0.5 py-2 text-sm">
                  <span className="font-medium">{ev.title ?? "Untitled event"}</span>
                  <span className="text-xs text-muted-foreground">
                    {ev.areaName ?? "—"}
                    {" · "}
                    {ev.reportedAt === null
                      ? "—"
                      : new Date(ev.reportedAt).toLocaleString()}
                    {" · "}
                    <span className="capitalize">
                      {ev.state.replace(/_/g, " ")}
                    </span>
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
