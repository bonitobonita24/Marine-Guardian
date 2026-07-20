"use client";

// S9 — 'Generate Printable' CTA for the Report Map page.
// Sits directly under the Events Over Time chart. Replicates the
// create→queue→link lifecycle of the Patrols generate-report-button.
//
// Template picker: fetches reportTemplate.list (enabled only when the dialog
// is open), defaults to the tenant's isDefault template. On confirm calls
// reportExport.create with reportType:'report_map' + current live filter from
// report-filter-context. Server RBAC enforced by reportGenerateProcedure in
// the reportExport.create handler.
//
// viewer role (2026-07-06): viewers CAN generate printable reports from this
// page — reportExport.create runs reportGenerateProcedure, which allows
// viewer in addition to coordinator+ (owner-approved, read-oriented "produce
// a PDF of what I can already see" action). The button is therefore no
// longer hidden for viewer sessions.
//
// Phase 4 S7 (2026-07-20) — IN-DIALOG DELIVERY. Generating no longer hands
// off to an /exports page (S8 deletes it). After create resolves, the dialog
// STAYS OPEN and renders one ExportProgressRow per queued file; each row
// polls itself and swaps its spinner for a Download button, with an on-demand
// "Generate PowerPoint" beside it (ADMIN ONLY — see canGeneratePptx below).
// Closing the dialog purges the files.
//
// Everything ABOVE the create call is unchanged: the template/region picker,
// the split-files and Event Highlights checkboxes, and the baseParams/payload
// construction that can produce 1-3 exports.

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import { useReportFilter } from "@/components/reporting/report-filter-context";
import { ExportProgressRow } from "./export-progress-row";
import { pickDefaultTemplateId } from "./select-default-template";

/** One generated file being tracked in-dialog. */
interface ExportRowEntry {
  id: string;
  label: string;
}

/** Mirrors the ReportExportStatus enum (kept local, as ExportProgressRow does). */
export type ExportRowStatus = "queued" | "rendering" | "ready" | "failed";

/**
 * Screen-reader summary for the dialog's polite live region.
 *
 * 2026-07-20 fix: this region used to hard-code "N report files are
 * generating." for as long as any row existed, so assistive tech kept
 * announcing "generating" long after the visible UI had swapped in Download
 * buttons. The text now tracks the ACTUAL aggregate state of the rows.
 *
 * Pure + exported so the wording is unit-testable without rendering the
 * dialog. Returns "" for an empty list so the region announces nothing before
 * any export exists.
 */
export function describeExportProgress(
  statuses: readonly ExportRowStatus[],
): string {
  if (statuses.length === 0) return "";

  const ready = statuses.filter((s) => s === "ready").length;
  const failed = statuses.filter((s) => s === "failed").length;
  const generating = statuses.length - ready - failed;

  const files = (n: number): string =>
    `${String(n)} report ${n === 1 ? "file" : "files"}`;

  const parts: string[] = [];
  if (generating > 0) {
    parts.push(`${files(generating)} ${generating === 1 ? "is" : "are"} generating.`);
  }
  if (ready > 0) {
    parts.push(`${files(ready)} ${ready === 1 ? "is" : "are"} ready to download.`);
  }
  if (failed > 0) {
    parts.push(`${files(failed)} ${failed === 1 ? "has" : "have"} failed.`);
  }
  return parts.join(" ");
}

export function GeneratePrintableButton() {
  const { data: session } = useSession();
  // PPTX is admin-only (2026-07-20 revert of the Phase 4 S6 widening):
  // reportExport.renderPptx runs adminProcedure, so only these three roles may
  // call it. Mirrors the roles.includes(...) session pattern already used by
  // rebuild-button.tsx / generate-report-button.tsx rather than inventing a
  // new client-side permission mechanism.
  //
  // Hiding the button is UX ONLY — the tRPC procedure is the real boundary.
  const roles = session?.user.roles ?? [];
  const canGeneratePptx =
    roles.includes("tenant_manager") ||
    roles.includes("tenant_superadmin") ||
    roles.includes("tenant_admin");

  const {
    from,
    to,
    municipalityId,
    protectedZoneId,
    province,
    includeChildren,
    includeTraversing,
  } = useReportFilter();
  const [open, setOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [splitFiles, setSplitFiles] = useState(false);
  // Event Highlights (2026-07-20): opt-in extra export — an A4 photo collage of
  // the scope's events that have photos AND filled-in narrative. Queued
  // alongside the standard report_map export, sharing the same scope params.
  const [highlights, setHighlights] = useState(false);
  // Rows appear once create resolves and are the dialog's post-Generate view.
  const [rows, setRows] = useState<ExportRowEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const REQUEST_TIMEOUT_MS = 15000;

  const templates = trpc.reportTemplate.list.useQuery(
    { limit: 50 },
    { enabled: open },
  );

  // Region options ("whole province" reports) are derived from the same
  // municipality.list source the map filter bar uses — it already returns
  // municipalities in the canonical province order (Oriental Mindoro →
  // Occidental Mindoro → Palawan; see report-filter-bar.tsx's provinceGroups
  // comment). We mirror that "first-appearance order" derivation locally
  // rather than importing a shared constant, since report-filter-bar.tsx
  // does not export one — it computes provinceNames inline the same way.
  const municipalities = trpc.municipality.list.useQuery(undefined, {
    enabled: open,
  });
  // Protected zones are fetched for the DEFAULT-SELECTION logic only (they are
  // not offered as dropdown options): resolving the scoped zone's name, and
  // classifying templates as place-specific vs generic.
  const protectedZones = trpc.municipality.protectedZones.useQuery(undefined, {
    enabled: open,
  });
  const provinceNames = (() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const m of municipalities.data ?? []) {
      if (!seen.has(m.province)) {
        seen.add(m.province);
        names.push(m.province);
      }
    }
    return names;
  })();
  const REGION_PREFIX = "region:";

  // Default-select a template on first dialog open, DERIVED FROM THE CURRENT
  // SCOPE (2026-07-20 fix). Previously this blindly took the tenant's isDefault
  // template, which mis-branded an all-municipalities report with the default
  // template's (Apo Reef Park) logos. pickDefaultTemplateId now prefers a
  // template matching the active scope, and otherwise a generic (non
  // place-specific) one — see select-default-template.ts.
  //
  // Runs ONCE per open (initializedRef): after it fires, a manual dropdown
  // choice is never overwritten, so the user's override always wins. Reset on
  // close so re-opening re-derives from whatever the scope is by then.
  //
  // Gated on all three queries having settled — municipalities and zones supply
  // the scope NAMES and the known-place list, so initializing before they load
  // would classify every template as generic and pick the wrong default.
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    if (!templates.data) return;
    if (municipalities.isLoading || protectedZones.isLoading) return;

    const municipalityRows = municipalities.data ?? [];
    const zoneRows = protectedZones.data ?? [];

    const scopedMunicipality =
      municipalityId !== null
        ? municipalityRows.find((m) => m.id === municipalityId)
        : undefined;
    const scopedZone =
      protectedZoneId !== null
        ? zoneRows.find((z) => z.id === protectedZoneId)
        : undefined;

    const knownPlaceNames = [
      ...municipalityRows.map((m) => m.name),
      ...zoneRows.map((z) => z.name),
      ...provinceNames,
    ];

    const nextId = pickDefaultTemplateId(
      templates.data.items,
      {
        zoneName: scopedZone?.name ?? null,
        municipalityName: scopedMunicipality?.name ?? null,
        provinceName: province,
      },
      knownPlaceNames,
    );

    if (nextId !== null) {
      setSelectedTemplateId(nextId);
      initializedRef.current = true;
    }
    // provinceNames is derived from municipalities.data on every render, so it
    // is intentionally NOT a dependency — municipalities.data covers it (a new
    // array identity each render would otherwise re-run this effect forever).
  }, [
    open,
    templates.data,
    municipalities.data,
    municipalities.isLoading,
    protectedZones.data,
    protectedZones.isLoading,
    municipalityId,
    protectedZoneId,
    province,
  ]);

  // No hook-level onSuccess/onError: feedback is set explicitly in
  // handleConfirm via mutateAsync so the split path (two concurrent creates)
  // reports reliably. Firing two create.mutate() calls on one useMutation and
  // counting their per-call callbacks is unreliable — react-query's single
  // observer does not deliver both callbacks, so the confirmation never showed
  // even though both exports were created (2026-07-13 fix).
  const create = trpc.reportExport.create.useMutation();

  // Best-effort cleanup fired on dialog close. See handleClose.
  const purge = trpc.reportExport.purge.useMutation();

  function clearRequestTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  // Ensure the timeout is always cancelled on unmount to prevent setState
  // being called on an unmounted component if the user navigates away.
  useEffect(() => clearRequestTimeout, []);

  async function handleConfirm() {
    setErrorMessage(null);
    clearRequestTimeout();
    timeoutRef.current = setTimeout(() => {
      if (create.isPending) {
        setErrorMessage(
          "The report service is taking too long to respond. Please try again in a moment.",
        );
      }
    }, REQUEST_TIMEOUT_MS);

    const isRegion = selectedTemplateId.startsWith(REGION_PREFIX);

    // Base scope — identical for both the single-file and split-file paths.
    // exportMode is orthogonal to scope (region vs template) and is only
    // added below when splitFiles is on.
    const baseParams = isRegion
      ? {
          // Region reports cover the whole province — no templateId, no
          // municipality/zone scope, ignoring the live map filter.
          province: selectedTemplateId.slice(REGION_PREFIX.length),
          from: from.toISOString(),
          to: to.toISOString(),
        }
      : {
          templateId: selectedTemplateId,
          from: from.toISOString(),
          to: to.toISOString(),
          ...(municipalityId !== null ? { municipalityId } : {}),
          ...(protectedZoneId !== null ? { protectedZoneId } : {}),
          ...(province !== null ? { province } : {}),
          ...(includeChildren ? { includeChildren } : {}),
          ...(includeTraversing ? { includeTraversing } : {}),
        };

    // Build the list of exports to queue. The standard report_map export is
    // either one combined file or the charts+lists split; the Event Highlights
    // photo collage (event_highlights) is an optional extra sharing the same
    // scope. All are fired together via mutateAsync + Promise.allSettled — each
    // returns an independent promise, so the confirmation resolves only after
    // ALL complete (avoids the single-observer callback race, 2026-07-13).
    //
    // `label` is carried alongside each payload so the resulting in-dialog row
    // is identifiable when up to three render simultaneously (S7).
    const payloads: {
      label: string;
      reportType: "report_map" | "event_highlights";
      paperSize: "A4";
      paramsJson: Record<string, unknown>;
    }[] = [];
    if (splitFiles) {
      for (const exportMode of ["charts", "lists"] as const) {
        payloads.push({
          label:
            exportMode === "charts"
              ? "Report (charts)"
              : "Report (detailed lists)",
          reportType: "report_map",
          paperSize: "A4",
          paramsJson: { ...baseParams, exportMode },
        });
      }
    } else {
      // No exportMode key — the server defaults paramsJson.exportMode to
      // "combined".
      payloads.push({
        label: "Report",
        reportType: "report_map",
        paperSize: "A4",
        paramsJson: baseParams,
      });
    }
    if (highlights) {
      payloads.push({
        label: "Event Highlights",
        reportType: "event_highlights",
        paperSize: "A4",
        paramsJson: baseParams,
      });
    }

    // allSettled (not all) so a partial failure still surfaces the exports
    // that DID queue — discarding a successful sibling would strand a file
    // the user can no longer reach now that /exports is gone.
    const results = await Promise.allSettled(
      payloads.map(({ label, ...payload }) =>
        create.mutateAsync(payload).then((data) => ({ id: data.id, label })),
      ),
    );
    clearRequestTimeout();

    const created: ExportRowEntry[] = [];
    let rejectedCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        created.push(result.value);
      } else {
        rejectedCount += 1;
      }
    }

    setRows(created);
    if (rejectedCount > 0) {
      // Generic text only — a create rejection can carry server detail we do
      // not want rendered, matching the poll queries' redaction posture.
      setErrorMessage(
        created.length > 0
          ? `${String(rejectedCount)} of ${String(results.length)} reports could not be queued. Please try again.`
          : "Failed to queue the report export. Please try again.",
      );
    }
  }

  function handleClose() {
    clearRequestTimeout();

    // BEST-EFFORT ONLY — this is an optimisation, NOT the retention
    // mechanism. The server-side `export-janitor` TTL sweep is the AUTHORITY
    // for deleting these ephemeral files and remains mandatory: a crashed
    // tab, a closed laptop, or a dropped connection never reaches this
    // handler, so a purge that never fires must still be safe. Deliberately
    // fire-and-forget — not awaited, never blocks the close, and its failure
    // is swallowed (reportExport.purge is non-throwing by design so this call
    // site can stay dumb).
    if (rows.length > 0) {
      try {
        purge.mutate({ ids: rows.map((r) => r.id) });
      } catch {
        // Intentionally swallowed. Closing the dialog must never fail because
        // cleanup did — the janitor sweep still collects the files.
      }
    }

    setOpen(false);
    setRows([]);
    setErrorMessage(null);
    setSelectedTemplateId("");
    setSplitFiles(false);
    setHighlights(false);
    create.reset();
  }

  const hasRows = rows.length > 0;

  // Aggregate row state for the dialog's live region (2026-07-20 fix — the
  // region used to say "generating" forever). These reuse the SAME query keys
  // ExportProgressRow polls with, so TanStack Query serves them from the one
  // shared cache entry per export: no extra network traffic and no second
  // polling loop — this observer just reads whatever the row's poll last
  // wrote. Announcing is the only thing done with it; the visible per-row UI
  // remains owned by ExportProgressRow.
  const pollQueries = trpc.useQueries((t) =>
    rows.map((row) => t.reportExport.pollStatus({ id: row.id })),
  );
  const rowStatuses: ExportRowStatus[] = pollQueries.map(
    (q) => q.data?.status ?? "queued",
  );
  const progressAnnouncement = describeExportProgress(rowStatuses);
  const confirmDisabled = create.isPending || selectedTemplateId === "";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setOpen(true);
        } else {
          handleClose();
        }
      }}
    >
      {/* DialogTrigger asChild is required so Radix tracks the opener element
          and can return focus to it when the dialog closes (WCAG 2.4.3). */}
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Generate printable report"
          data-testid="generate-printable-report-button"
        >
          Generate Printable
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Printable Report</DialogTitle>
          <DialogDescription>
            Renders a PDF of the current map view. Each file appears below and
            becomes downloadable as soon as it is ready — keep this dialog open
            until you have downloaded what you need, as closing it deletes the
            generated files.
          </DialogDescription>
        </DialogHeader>

        {/* Screen-reader live region for non-error status announcements (WCAG
            4.1.3). Errors use role="alert" (assertive) below — keep them out
            of this polite region to avoid double-announcement. Per-file state
            transitions are announced by each ExportProgressRow's own region. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="export-progress-live-region"
        >
          {create.isPending && "Queuing report export…"}
          {progressAnnouncement}
        </div>

        {hasRows ? (
          <div className="space-y-2" data-testid="export-progress-rows">
            {rows.map((row) => (
              <ExportProgressRow
                key={row.id}
                exportId={row.id}
                label={row.label}
                canGeneratePptx={canGeneratePptx}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-template">Report template</Label>
              <select
                id="report-template"
                data-testid="report-template-select"
                value={selectedTemplateId}
                onChange={(e) => { setSelectedTemplateId(e.target.value); }}
                aria-label="Report template"
                aria-describedby="report-template-hint"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {templates.isLoading ? (
                  <option value="">Loading templates…</option>
                ) : (templates.data?.items.length ?? 0) === 0 &&
                  provinceNames.length === 0 ? (
                  <option value="">No templates available</option>
                ) : (
                  <>
                    {provinceNames.length > 0 && (
                      <optgroup label="Regions">
                        {provinceNames.map((name) => (
                          <option key={name} value={`${REGION_PREFIX}${name}`}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {(templates.data?.items.length ?? 0) > 0 && (
                      <optgroup label="Templates">
                        {templates.data?.items.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name}
                            {tpl.isDefault ? " (default)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                )}
              </select>
              {/* The dropdown is BRANDING ONLY — it selects logos, title and
                  layout. It does NOT scope the report; scope comes solely from
                  the map filters. Users reasonably assume otherwise, so say it
                  plainly (kept to one line). */}
              <p
                id="report-template-hint"
                className="text-xs text-muted-foreground"
                data-testid="report-template-hint"
              >
                Branding only — logos, title and layout. The report&apos;s scope
                comes from the map filters.
              </p>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="split-files"
                data-testid="split-files-checkbox"
                checked={splitFiles}
                onCheckedChange={(checked) => { setSplitFiles(checked === true); }}
                aria-describedby="split-files-hint"
                className="mt-0.5"
              />
              <div className="grid gap-0.5 leading-none">
                <Label htmlFor="split-files" className="cursor-pointer">
                  Split charts and detailed lists into separate files
                </Label>
                <p
                  id="split-files-hint"
                  className="text-xs text-muted-foreground"
                >
                  Creates two downloadable files instead of one.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="event-highlights"
                data-testid="event-highlights-checkbox"
                checked={highlights}
                onCheckedChange={(checked) => { setHighlights(checked === true); }}
                aria-describedby="event-highlights-hint"
                className="mt-0.5"
              />
              <div className="grid gap-0.5 leading-none">
                <Label htmlFor="event-highlights" className="cursor-pointer">
                  Also generate Event Highlights (photo collage)
                </Label>
                <p
                  id="event-highlights-hint"
                  className="text-xs text-muted-foreground"
                >
                  A separate A4 report featuring large photos of the scope&apos;s
                  events that have images and filled-in details.
                </p>
              </div>
            </div>
          </div>
        )}

        {errorMessage !== null && (
          <p
            className="text-sm text-destructive"
            role="alert"
            data-testid="generate-printable-error"
          >
            {errorMessage}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={create.isPending}
            data-testid="generate-printable-close"
          >
            {hasRows ? "Close" : "Cancel"}
          </Button>
          {!hasRows && (
            <Button
              data-testid="generate-printable-confirm"
              onClick={() => void handleConfirm()}
              disabled={confirmDisabled}
              aria-busy={create.isPending}
            >
              {create.isPending ? "Queuing…" : "Generate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
