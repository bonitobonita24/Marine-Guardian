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

import { useMemo } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { StatusBadge, type ExportStatus } from "./status-badge";
import { RetryButton } from "./retry-button";

export interface ExportRowItem {
  id: string;
  reportType: string;
  paperSize: string;
  status: ExportStatus;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  requestedBy: { id: string; fullName: string } | null;
}

interface ExportRowProps {
  row: ExportRowItem;
}

const POLL_INTERVAL_MS = 3000;

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

  return (
    <TableRow data-testid={`export-row-${row.id}`}>
      <TableCell className="font-medium capitalize">
        {row.reportType.replace(/_/g, " ")}
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
        {formatDate(pollQuery.data?.completedAt ?? row.completedAt)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {currentStatus === "ready" && downloadUrl !== null && (
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
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
