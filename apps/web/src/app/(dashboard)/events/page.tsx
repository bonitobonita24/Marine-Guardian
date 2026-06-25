"use client";

/**
 * Events page — Milestone 3 (q-ops-01)
 *
 * Replaces the Kanban board with the EventsList infinite-scroll Operations List.
 * All data fetching, filters, pagination, and modal state live in EventsList.
 * Stats summary kept in the page header; Export buttons preserved.
 *
 * Deep-link: `/events?eventId=<id>` auto-opens the EventDetailModal for that
 * event. Alert History and Notifications link here instead of the nonexistent
 * `/events/[id]` route (fix for P1-A).
 */

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildExportUrl } from "@/lib/exports";
import { EventsList } from "@/components/events/events-list";
import { trpc } from "@/lib/trpc/client";

function stateColor(state: string) {
  switch (state) {
    case "new_event": return "text-[hsl(var(--caution))]";
    case "active":    return "text-[hsl(var(--info))]";
    case "resolved":  return "text-[hsl(var(--success))]";
    default:          return "text-muted-foreground";
  }
}

export default function EventsPage() {
  const searchParams = useSearchParams();
  // Deep-link support: ?eventId=<id> opens the event dialog on mount.
  // Alert History and Notifications rows link here instead of the missing
  // /events/[id] route.
  const deepLinkEventId = searchParams.get("eventId");
  const statsQuery = trpc.event.stats.useQuery();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Events</h1>
        <div className="flex items-center gap-4">
          {statsQuery.data !== undefined && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{statsQuery.data.total} total</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span className={stateColor("new_event")}>
                {statsQuery.data.newEvents} new
              </span>
              <span className={stateColor("active")}>
                {statsQuery.data.active} active
              </span>
              <span className={stateColor("resolved")}>
                {statsQuery.data.resolved} resolved
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={buildExportUrl("events", {}, "csv")} download>
                Export CSV
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={buildExportUrl("events", {}, "pdf")} download>
                Export PDF
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Operations List — infinite-scroll, server-side filters, inline state */}
      <EventsList initialEventId={deepLinkEventId} />
    </div>
  );
}
