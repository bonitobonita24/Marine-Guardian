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
// longer hidden for viewer sessions; a viewer can generate, and retrieve the
// result on /exports (reportExport.list/getById/getDownloadUrl are all
// tenantProcedure — any authenticated tenant user, including viewer, can
// already read them).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { useTenantSlug } from "@/lib/routing/use-tenant-slug";
import { tenantHref } from "@/lib/routing/tenant-href";

export function GeneratePrintableButton() {
  const tenant = useTenantSlug();
  const { from, to, municipalityId, protectedZoneId, province, includeChildren } =
    useReportFilter();
  const [open, setOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [splitFiles, setSplitFiles] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; exportId: string; count: number }
    | { kind: "error"; message: string }
    | null
  >(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const REQUEST_TIMEOUT_MS = 15000;
  // When true, the two split-mode create.mutate calls track their own
  // completion via per-call callbacks (see handleConfirm) — the hook-level
  // onSuccess/onError below must stand down so a single exportMode result
  // doesn't clobber the combined feedback message.
  const splitTrackingRef = useRef(false);
  const splitResultRef = useRef<{ done: number; errors: string[] }>({
    done: 0,
    errors: [],
  });

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

  // Default-select the isDefault template (or first) on first dialog open.
  // Reset on close so re-open re-runs this selection.
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (!templates.data || initializedRef.current) return;
    const items = templates.data.items;
    const defaultTpl = items.find((t) => t.isDefault) ?? items[0];
    if (defaultTpl) {
      setSelectedTemplateId(defaultTpl.id);
      initializedRef.current = true;
    }
  }, [open, templates.data]);

  const create = trpc.reportExport.create.useMutation({
    onSuccess: (data) => {
      if (splitTrackingRef.current) return;
      setFeedback({ kind: "success", exportId: data.id, count: 1 });
    },
    onError: (err) => {
      if (splitTrackingRef.current) return;
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function clearRequestTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  // Ensure the timeout is always cancelled on unmount to prevent setState
  // being called on an unmounted component if the user navigates away.
  useEffect(() => clearRequestTimeout, []);

  function handleConfirm() {
    setFeedback(null);
    clearRequestTimeout();
    timeoutRef.current = setTimeout(() => {
      if (create.isPending) {
        setFeedback({
          kind: "error",
          message:
            "The report service is taking too long to respond. Please try again in a moment.",
        });
        create.reset();
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
        };

    if (!splitFiles) {
      // Unchanged single-file path: no exportMode key at all — the server
      // defaults paramsJson.exportMode to "combined".
      create.mutate(
        {
          reportType: "report_map",
          paperSize: "A4",
          paramsJson: baseParams,
        },
        {
          onSettled: () => {
            clearRequestTimeout();
          },
        },
      );
      return;
    }

    // Split path: fire two exports (charts-only + lists-only) sharing the
    // same scope. Tracked via splitResultRef/splitTrackingRef rather than
    // the hook-level onSuccess/onError, so a single exportMode's result
    // doesn't prematurely overwrite the combined feedback message.
    splitTrackingRef.current = true;
    splitResultRef.current = { done: 0, errors: [] };

    const finalizeSplit = () => {
      if (splitResultRef.current.done < 2) return;
      splitTrackingRef.current = false;
      clearRequestTimeout();
      const { errors } = splitResultRef.current;
      if (errors.length > 0) {
        setFeedback({ kind: "error", message: errors[0] as string });
      } else {
        setFeedback({ kind: "success", exportId: "split", count: 2 });
      }
    };

    (["charts", "lists"] as const).forEach((exportMode) => {
      create.mutate(
        {
          reportType: "report_map",
          paperSize: "A4",
          paramsJson: { ...baseParams, exportMode },
        },
        {
          onSuccess: () => {
            splitResultRef.current.done += 1;
            finalizeSplit();
          },
          onError: (err) => {
            splitResultRef.current.done += 1;
            splitResultRef.current.errors.push(err.message);
            finalizeSplit();
          },
        },
      );
    });
  }

  function handleClose() {
    clearRequestTimeout();
    setOpen(false);
    setFeedback(null);
    setSelectedTemplateId("");
    setSplitFiles(false);
    splitTrackingRef.current = false;
    create.reset();
  }

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
            Queues an asynchronous PDF render of the current map view. You can
            track progress and download the result from the Exports page once
            ready.
          </DialogDescription>
        </DialogHeader>

        {/* Screen-reader live region for non-error status announcements (WCAG
            4.1.3). Errors use role="alert" (assertive) below — keep them out
            of this polite region to avoid double-announcement. */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {create.isPending && "Queuing report export…"}
          {feedback?.kind === "success" && "Report export queued successfully."}
        </div>

        {feedback?.kind === "success" ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {feedback.count === 2
              ? "2 report exports queued (Summary & Charts + Detailed Event Lists)."
              : `Export queued (id: ${feedback.exportId}).`}{" "}
            <Link
              href={tenantHref(tenant, "/exports")}
              className="underline underline-offset-4"
              data-testid="generate-printable-go-to-exports"
            >
              View in Exports
            </Link>
            .
          </p>
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
          </div>
        )}

        {feedback?.kind === "error" && (
          <p className="text-sm text-destructive" role="alert">
            {feedback.message}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={create.isPending}
          >
            {feedback?.kind === "success" ? "Close" : "Cancel"}
          </Button>
          {feedback?.kind !== "success" && (
            <Button
              data-testid="generate-printable-confirm"
              onClick={handleConfirm}
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
