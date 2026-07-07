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
  const { from, to, municipalityId, protectedZoneId } = useReportFilter();
  const [open, setOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [feedback, setFeedback] = useState<
    | { kind: "success"; exportId: string }
    | { kind: "error"; message: string }
    | null
  >(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const REQUEST_TIMEOUT_MS = 15000;

  const templates = trpc.reportTemplate.list.useQuery(
    { limit: 50 },
    { enabled: open },
  );

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
      setFeedback({ kind: "success", exportId: data.id });
    },
    onError: (err) => {
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

    create.mutate(
      {
        reportType: "report_map",
        paperSize: "A4",
        paramsJson: {
          templateId: selectedTemplateId,
          from: from.toISOString(),
          to: to.toISOString(),
          ...(municipalityId !== null ? { municipalityId } : {}),
          ...(protectedZoneId !== null ? { protectedZoneId } : {}),
        },
      },
      {
        onSettled: () => {
          clearRequestTimeout();
        },
      },
    );
  }

  function handleClose() {
    clearRequestTimeout();
    setOpen(false);
    setFeedback(null);
    setSelectedTemplateId("");
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
            Export queued (id: {feedback.exportId}).{" "}
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
                ) : (templates.data?.items.length ?? 0) === 0 ? (
                  <option value="">No templates available</option>
                ) : (
                  templates.data?.items.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      {tpl.isDefault ? " (default)" : ""}
                    </option>
                  ))
                )}
              </select>
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
