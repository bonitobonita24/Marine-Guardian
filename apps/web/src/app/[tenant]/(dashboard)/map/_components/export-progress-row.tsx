"use client";

// Phase 4 S7 — one row per file being generated, rendered INSIDE the
// "Generate Printable Report" dialog.
//
// This replaces the old "View in Exports" hand-off entirely: the /exports page
// is removed in S8, so the dialog itself is now the only place a user ever
// sees a generated report. The row owns the whole per-file lifecycle:
//
//   queued/rendering  → spinner + label
//   ready             → [Download]  [Generate PowerPoint]
//   PPTX requested    → [Download]  [spinner]
//   PPTX ready        → [Download]  [Download PowerPoint]
//   failed            → generic failure message (never raw error text)
//
// POLLING STOPS AT TERMINAL STATE. Both pollStatus and pollPptxStatus use the
// TanStack Query v5 functional `refetchInterval`, which returns `false` once
// the polled status is ready/failed. This matters more here than it did on the
// old /exports page: a dialog left open on a finished report would otherwise
// poll forever, and there is no route change to unmount it.
//
// ERROR TEXT IS NEVER RENDERED RAW. reportExport.pollStatus / pollPptxStatus
// already redact server-side (they return a generic string and log the real
// cause), so the only thing this component may render is whatever the poll
// query handed it — plus a local fallback when that field is null. It must
// never reach for another source of error detail.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";

/** Poll cadence while a render is in flight — matches the 3s the removed
 * /exports page used, which was tuned against real render durations. */
export const EXPORT_POLL_INTERVAL_MS = 3000;

/**
 * Shown when a render failed but the poll query returned a null message.
 * The server's own generic string is preferred when present; this only fills
 * the null case so a failed row always explains itself.
 */
export const EXPORT_ROW_FAILURE_FALLBACK =
  "Report generation failed. Please try again.";

/** Mirrors the ReportExportStatus enum. Declared locally rather than imported
 * from the /exports directory, which S8 deletes. */
type ExportStatus = "queued" | "rendering" | "ready" | "failed";

function isTerminal(status: ExportStatus | null | undefined): boolean {
  return status === "ready" || status === "failed";
}

export interface ExportProgressRowProps {
  /** ReportExport id returned by reportExport.create. */
  exportId: string;
  /** Human label distinguishing simultaneous rows, e.g. "Report (charts)". */
  label: string;
}

export function ExportProgressRow({ exportId, label }: ExportProgressRowProps) {
  // The PPTX poll must not run before the user asks for one: pptxStatus is
  // null until renderPptx is called, and null is not terminal, so an
  // unconditional poll would spin at 3s forever on every row.
  const [pptxRequested, setPptxRequested] = useState(false);

  const poll = trpc.reportExport.pollStatus.useQuery(
    { id: exportId },
    {
      refetchInterval: (query) =>
        isTerminal(query.state.data?.status) ? false : EXPORT_POLL_INTERVAL_MS,
    },
  );

  // A null poll result means the row is gone (purged). Treat it as pending
  // rather than inventing a terminal state — the dialog is closing anyway.
  const status: ExportStatus = poll.data?.status ?? "queued";

  const download = trpc.reportExport.getDownloadUrl.useQuery(
    { id: exportId },
    { enabled: status === "ready" },
  );
  const downloadUrl: string | null = download.data?.downloadUrl ?? null;

  const renderPptx = trpc.reportExport.renderPptx.useMutation();

  const pptxPoll = trpc.reportExport.pollPptxStatus.useQuery(
    { id: exportId },
    {
      enabled: pptxRequested,
      refetchInterval: (query) =>
        isTerminal(query.state.data?.pptxStatus)
          ? false
          : EXPORT_POLL_INTERVAL_MS,
    },
  );
  const pptxStatus: ExportStatus | null = pptxPoll.data?.pptxStatus ?? null;

  const pptxDownload = trpc.reportExport.getPptxDownloadUrl.useQuery(
    { id: exportId },
    { enabled: pptxStatus === "ready" },
  );
  const pptxUrl: string | null = pptxDownload.data?.downloadUrl ?? null;

  const pdfPending = status === "queued" || status === "rendering";
  const pptxPending =
    pptxRequested &&
    (renderPptx.isPending ||
      pptxStatus === null ||
      pptxStatus === "queued" ||
      pptxStatus === "rendering");

  const failureMessage: string =
    poll.data?.errorMessage ?? EXPORT_ROW_FAILURE_FALLBACK;
  const pptxFailureMessage: string =
    pptxPoll.data?.pptxErrorMessage ?? EXPORT_ROW_FAILURE_FALLBACK;

  // Announced state, kept as one short sentence per row. Follows the dialog's
  // existing sr-only aria-live pattern rather than introducing a new one.
  const announcement =
    status === "ready"
      ? `${label} is ready to download.`
      : status === "failed"
        ? `${label} failed.`
        : `${label} is generating.`;

  return (
    <div
      data-testid={`export-progress-row-${exportId}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
    >
      <span className="text-sm">{label}</span>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pdfPending && (
          <span
            data-testid={`export-progress-spinner-${exportId}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            aria-busy={true}
          >
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Generating…
          </span>
        )}

        {status === "ready" && (
          <>
            <Button
              size="sm"
              variant="outline"
              asChild
              disabled={downloadUrl === null}
              data-testid={`export-download-${exportId}`}
            >
              <a href={downloadUrl ?? "#"} download>
                Download
              </a>
            </Button>

            {pptxStatus === "ready" ? (
              <Button
                size="sm"
                variant="outline"
                asChild
                disabled={pptxUrl === null}
                data-testid={`export-download-pptx-${exportId}`}
              >
                <a href={pptxUrl ?? "#"} download>
                  Download PowerPoint
                </a>
              </Button>
            ) : pptxPending ? (
              <span
                data-testid={`export-pptx-spinner-${exportId}`}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                aria-busy={true}
              >
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Generating PowerPoint…
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                data-testid={`export-render-pptx-${exportId}`}
                onClick={() => {
                  setPptxRequested(true);
                  renderPptx.mutate({ id: exportId });
                }}
              >
                {pptxStatus === "failed"
                  ? "Retry PowerPoint"
                  : "Generate PowerPoint"}
              </Button>
            )}

            {pptxStatus === "failed" && (
              <span
                className="text-xs text-destructive"
                data-testid={`export-pptx-error-${exportId}`}
                role="alert"
              >
                {pptxFailureMessage}
              </span>
            )}
          </>
        )}

        {status === "failed" && (
          <span
            className="text-xs text-destructive"
            data-testid={`export-error-${exportId}`}
            role="alert"
          >
            {failureMessage}
          </span>
        )}
      </div>
    </div>
  );
}
