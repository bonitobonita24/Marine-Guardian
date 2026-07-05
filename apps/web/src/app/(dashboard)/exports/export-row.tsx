"use client";

// 5.3d — single ReportExport row with live polling for in-flight statuses.
//
// For rows whose current status is (queued, rendering) we subscribe to
// trpc.reportExport.pollStatus with refetchInterval=3000 — React Query
// re-fetches every 3s until status reaches a terminal state (ready, failed).
// For terminal rows we disable polling entirely (refetchInterval=false).
//
// When the polled status transitions to "ready", the action cell swaps the
// in-flight spinner for a Download button linking to the per-row download URL
// (resolved on-demand via getDownloadUrl, which returns the Route Handler URL
// shape locked in DECISIONS_LOG "ReportExport Download URL Shape" — 5.3c).
//
// When status reaches "failed", the action cell shows the Retry button
// (admin-only, gated client-side by the button itself per [[5.3c]]).
//
// Report Summary column (2026-07 harden pass) — surfaces what was actually
// generated (report type, municipality, date range, MPA zone) so a user
// doesn't re-generate the same export. reportSummary is resolved server-side
// (reportExport.list) from paramsJson's IDs; buildReportSummaryLabel() below
// just formats the already-resolved names/dates into one readable string.
//
// In-flight affordance (2026-07 harden pass) — queued/rendering rows show an
// animated spinner + elapsed time computed from createdAt, ticking forward on
// the existing 3s poll interval (no separate timer — see InFlightIndicator).

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { StatusBadge, type ExportStatus } from "./status-badge";
import { RetryButton } from "./retry-button";
import { StopButton } from "./stop-button";
import { DeleteButton } from "./delete-button";

/** Resolved-name summary of a report's generation parameters (paramsJson),
 * batch-resolved server-side by reportExport.list. Optional/nullable because
 * not every reportType populates every field (e.g. only report_map carries
 * municipalityId/protectedZoneId; only area carries areaBoundaryId). */
export interface ReportExportSummary {
  municipalityName: string | null;
  protectedZoneName: string | null;
  templateName: string | null;
  areaName: string | null;
  from: string | null;
  to: string | null;
  period: { year: number; month: number } | null;
}

export interface ExportRowItem {
  id: string;
  reportType: string;
  paperSize: string;
  status: ExportStatus;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  requestedBy: { id: string; fullName: string } | null;
  // Optional — older test fixtures / callers that predate the Report Summary
  // column may omit this or pass undefined explicitly; the cell falls back
  // to just the humanized report type when absent.
  reportSummary?: ReportExportSummary | null | undefined;
}

interface ExportRowProps {
  row: ExportRowItem;
}

const POLL_INTERVAL_MS = 3000;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function humanizeReportType(reportType: string): string {
  const withSpaces = reportType.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function formatDate(date: Date | null): string {
  if (date === null) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) +
    " " +
    d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

/** Same short date style as the rest of the table, without the time-of-day
 * suffix (a params date range is a calendar range, not a timestamp). Returns
 * null for missing/invalid input so callers can omit the segment entirely. */
function formatSummaryDate(iso: string | null | undefined): string | null {
  if (iso === null || iso === undefined) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  const fromStr = formatSummaryDate(from);
  const toStr = formatSummaryDate(to);
  if (fromStr !== null && toStr !== null) return `${fromStr} – ${toStr}`;
  if (fromStr !== null) return `From ${fromStr}`;
  if (toStr !== null) return `Until ${toStr}`;
  return null;
}

/**
 * Builds the human-readable "what was generated" label for the Report
 * Summary column. Report-type-specific because paramsJson's shape (and thus
 * what's meaningful to show) differs per reportType — see
 * generate-report-button.tsx + generate-printable-button.tsx for the write
 * sites. Exported for direct unit testing.
 */
export function buildReportSummaryLabel(row: ExportRowItem): string {
  const typeLabel = humanizeReportType(row.reportType);
  const s = row.reportSummary;
  if (s === undefined || s === null) return typeLabel;

  if (row.reportType === "report_map") {
    const parts = [typeLabel];
    parts.push(s.municipalityName ?? "All municipalities");
    const range = formatDateRange(s.from, s.to);
    if (range !== null) parts.push(range);
    parts.push(`Zone: ${s.protectedZoneName ?? "—"}`);
    return parts.join(" · ");
  }

  if (row.reportType === "area") {
    const parts = [typeLabel];
    if (s.areaName !== null) parts.push(s.areaName);
    const range = formatDateRange(s.from, s.to);
    if (range !== null) parts.push(range);
    return parts.join(" · ");
  }

  if (row.reportType === "coverage" && s.period !== null) {
    const monthName = MONTH_NAMES[s.period.month - 1] ?? String(s.period.month);
    return `${typeLabel} · ${monthName} ${String(s.period.year)}`;
  }

  return typeLabel;
}

/**
 * Same summary as buildReportSummaryLabel, but split so the date range renders
 * on its OWN line beneath the primary details — the inline range was long
 * enough to push/hide the other details (municipality, Zone) in the truncated
 * cell. `primary` = type · municipality · Zone (report_map) / type · area
 * (area) / type · month year (coverage); `dateRange` = the from–to range on
 * its own line (null when the type has no range). Exported for unit testing.
 */
export function buildReportSummaryParts(row: ExportRowItem): {
  primary: string;
  dateRange: string | null;
} {
  const typeLabel = humanizeReportType(row.reportType);
  const s = row.reportSummary;
  if (s === undefined || s === null) return { primary: typeLabel, dateRange: null };

  if (row.reportType === "report_map") {
    const primary = [
      typeLabel,
      s.municipalityName ?? "All municipalities",
      `Zone: ${s.protectedZoneName ?? "—"}`,
    ].join(" · ");
    return { primary, dateRange: formatDateRange(s.from, s.to) };
  }

  if (row.reportType === "area") {
    const parts = [typeLabel];
    if (s.areaName !== null) parts.push(s.areaName);
    return { primary: parts.join(" · "), dateRange: formatDateRange(s.from, s.to) };
  }

  if (row.reportType === "coverage" && s.period !== null) {
    const monthName = MONTH_NAMES[s.period.month - 1] ?? String(s.period.month);
    return {
      primary: `${typeLabel} · ${monthName} ${String(s.period.year)}`,
      dateRange: null,
    };
  }

  return { primary: typeLabel, dateRange: null };
}

/** mm:ss (or h:mm:ss once past an hour) elapsed since `since`. */
function formatElapsed(since: Date, now: Date): string {
  const totalSeconds = Math.max(
    0,
    Math.floor((now.getTime() - since.getTime()) / 1000),
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours)}h ${String(minutes)}m`;
  }
  if (minutes > 0) {
    return `${String(minutes)}m ${String(seconds)}s`;
  }
  return `${String(seconds)}s`;
}

interface InFlightIndicatorProps {
  status: ExportStatus;
  createdAt: Date;
}

/**
 * Honest in-progress affordance — there is no percent-complete field on
 * ReportExport (pollStatus never returns one), so this never invents a fake
 * progress bar. It shows an animated spinner + elapsed time derived from
 * createdAt, re-computed on every render — which happens on the existing 3s
 * poll tick (ExportRow re-renders whenever pollQuery.data changes), so no
 * separate interval timer is needed here.
 */
function InFlightIndicator({ status, createdAt }: InFlightIndicatorProps) {
  const label = status === "queued" ? "Queued" : "Rendering";
  const elapsed = formatElapsed(createdAt, new Date());
  return (
    <span
      data-testid="export-in-flight-indicator"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      {label}… {elapsed}
    </span>
  );
}

export function ExportRow({ row }: ExportRowProps) {
  // Poll only while status is in-flight. React Query honors refetchInterval
  // = false to disable polling entirely once the row is terminal.
  const isInFlight = row.status === "queued" || row.status === "rendering";

  const pollQuery = trpc.reportExport.pollStatus.useQuery(
    { id: row.id },
    {
      enabled: isInFlight,
      refetchInterval: isInFlight ? POLL_INTERVAL_MS : false,
      // Initial value comes from the page's list query — avoid an immediate
      // re-fetch round-trip on first render.
      initialData: {
        id: row.id,
        status: row.status,
        completedAt: row.completedAt,
        errorMessage: row.errorMessage,
        fileSizeBytes: null,
      },
    },
  );

  const currentStatus: ExportStatus = pollQuery.data?.status ?? row.status;

  // Only resolve the download URL once the row reaches ready — avoids
  // pulling the URL for every row on every poll tick.
  const downloadQuery = trpc.reportExport.getDownloadUrl.useQuery(
    { id: row.id },
    { enabled: currentStatus === "ready" },
  );
  const downloadUrl = useMemo(
    () => downloadQuery.data?.downloadUrl ?? null,
    [downloadQuery.data?.downloadUrl],
  );

  const summaryLabel = useMemo(() => buildReportSummaryLabel(row), [row]);
  const summaryParts = useMemo(() => buildReportSummaryParts(row), [row]);

  return (
    <TableRow data-testid={`export-row-${row.id}`}>
      <TableCell className="font-medium capitalize">
        {row.reportType.replace(/_/g, " ")}
      </TableCell>
      <TableCell
        className="max-w-xs text-muted-foreground"
        title={summaryLabel}
        data-testid="export-report-summary"
      >
        <span className="block truncate">{summaryParts.primary}</span>
        {summaryParts.dateRange !== null && (
          <span className="block truncate text-xs opacity-80">
            {summaryParts.dateRange}
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{row.paperSize}</TableCell>
      <TableCell>
        <StatusBadge status={currentStatus} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {row.requestedBy?.fullName ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(row.createdAt)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {/* "Completed" is only meaningful for a terminal status — a queued /
            rendering row is NOT done, so never show a completion time for it
            (guards against a stale/transient completedAt showing while the
            row is still rendering; owner report 2026-07-05). */}
        {currentStatus === "ready" || currentStatus === "failed"
          ? formatDate(pollQuery.data?.completedAt ?? row.completedAt)
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {(currentStatus === "queued" || currentStatus === "rendering") && (
            <>
              <InFlightIndicator status={currentStatus} createdAt={row.createdAt} />
              <StopButton exportId={row.id} />
            </>
          )}
          {currentStatus === "ready" && (
            <>
              {downloadUrl !== null && (
                <Button asChild size="sm" variant="outline">
                  <a
                    data-testid="export-download-link"
                    href={downloadUrl}
                    download
                  >
                    Download
                  </a>
                </Button>
              )}
              <DeleteButton exportId={row.id} />
            </>
          )}
          {currentStatus === "failed" && (
            <>
              {(pollQuery.data?.errorMessage ?? row.errorMessage) !== null && (
                <span
                  className="hidden text-xs text-destructive sm:inline"
                  title={pollQuery.data?.errorMessage ?? row.errorMessage ?? ""}
                  data-testid="export-error-message"
                >
                  {pollQuery.data?.errorMessage ?? row.errorMessage}
                </span>
              )}
              <RetryButton exportId={row.id} />
              <DeleteButton exportId={row.id} />
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
