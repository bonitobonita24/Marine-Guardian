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
 *
 * P1-EXPORT-FILTERS fix: export buttons now fetch via JS so they (a) carry the
 * active list filters and (b) handle HTTP 413 gracefully with an in-page error
 * banner instead of navigating to a raw JSON response.
 */

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildExportUrl } from "@/lib/exports";
import { EventsList, type EventsListExportFilters } from "@/components/events/events-list";
import { trpc } from "@/lib/trpc/client";

function stateColor(state: string) {
  switch (state) {
    case "new_event": return "text-[hsl(var(--caution))]";
    case "active":    return "text-[hsl(var(--info))]";
    case "resolved":  return "text-[hsl(var(--success))]";
    default:          return "text-muted-foreground";
  }
}

/**
 * Trigger a file download from a fetch Response whose Content-Disposition
 * header carries an `attachment; filename="…"` value.  Creates a temporary
 * object URL, clicks a hidden anchor, then revokes the URL.
 */
async function downloadResponse(res: Response): Promise<void> {
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const cd   = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] ?? "export";
  const a = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function EventsPage() {
  const searchParams = useSearchParams();
  // Deep-link support: ?eventId=<id> opens the event dialog on mount.
  const deepLinkEventId = searchParams.get("eventId");
  const statsQuery = trpc.event.stats.useQuery();

  // Tracks the filter state that EventsList is currently applying.
  // Updated via onFiltersChange callback — keeps export URLs in sync.
  const [activeFilters, setActiveFilters] = useState<EventsListExportFilters>({});

  // Per-button loading + error state for the two export actions.
  const [csvState, setCsvState] = useState<"idle" | "loading" | "error">("idle");
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  const handleFiltersChange = useCallback((filters: EventsListExportFilters) => {
    setActiveFilters(filters);
    // Clear any previous export error whenever the user changes filters so
    // the stale message does not confuse them after they've narrowed results.
    setExportError(null);
    setCsvState("idle");
    setPdfState("idle");
  }, []);

  const triggerExport = useCallback(
    async (format: "csv" | "pdf") => {
      const setFormatState = format === "csv" ? setCsvState : setPdfState;
      setFormatState("loading");
      setExportError(null);

      try {
        const url = buildExportUrl("events", activeFilters, format);
        const res = await fetch(url, { credentials: "same-origin" });

        if (res.status === 413) {
          const body = await res.json() as { error?: string };
          setFormatState("error");
          setExportError(
            body.error ?? "Too many rows — narrow your filters and try again.",
          );
          return;
        }

        if (!res.ok) {
          setFormatState("error");
          setExportError(`Export failed (HTTP ${String(res.status)}). Please try again.`);
          return;
        }

        await downloadResponse(res);
        setFormatState("idle");
      } catch {
        setFormatState("error");
        setExportError("Export failed — please check your connection and try again.");
      }
    },
    [activeFilters],
  );

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
            <Button
              variant="outline"
              size="sm"
              disabled={csvState === "loading"}
              onClick={() => { void triggerExport("csv"); }}
              data-testid="export-csv-button"
            >
              {csvState === "loading" ? "Exporting…" : "Export CSV"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pdfState === "loading"}
              onClick={() => { void triggerExport("pdf"); }}
              data-testid="export-pdf-button"
            >
              {pdfState === "loading" ? "Exporting…" : "Export PDF"}
            </Button>
          </div>
        </div>
      </div>

      {/* Export error banner — shown on 413 or other non-OK responses */}
      {exportError !== null && (
        <div
          role="alert"
          data-testid="export-error-banner"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {exportError}
        </div>
      )}

      {/* Operations List — infinite-scroll, server-side filters, inline state */}
      <EventsList
        initialEventId={deepLinkEventId}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  );
}
