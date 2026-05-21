"use client";

// 5.3d — Generate Report CTA on the Patrols page. Coordinator+ (super_admin /
// site_admin / field_coordinator) can fire a reportExport.create which inserts
// a queued row + enqueues the BullMQ pdf-render job + writes EXPORT_REQUESTED
// audit. Hidden from operator sessions client-side; server enforces via
// coordinatorProcedure.
//
// On success, surfaces a link to /exports where the user can poll status +
// download the result once ready.

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

type ReportType =
  | "coverage"
  | "area"
  | "consolidated"
  | "detailed"
  | "rangers"
  | "patrol_filtered";

type PaperSize = "A4" | "Letter" | "Legal";

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "coverage", label: "Coverage Report" },
  { value: "area", label: "Per Area Report" },
  { value: "consolidated", label: "Consolidated Report" },
  { value: "detailed", label: "Detailed Report" },
  { value: "rangers", label: "Rangers Report" },
  { value: "patrol_filtered", label: "Patrol-Filtered Report" },
];

const PAPER_SIZE_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: "A4", label: "A4" },
  { value: "Letter", label: "Letter" },
  { value: "Legal", label: "Legal" },
];

export function GenerateReportButton() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("coverage");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [feedback, setFeedback] = useState<
    | { kind: "success"; exportId: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const roles = session?.user.roles ?? [];
  const canGenerate =
    roles.includes("super_admin") ||
    roles.includes("site_admin") ||
    roles.includes("field_coordinator");

  const create = trpc.reportExport.create.useMutation({
    onSuccess: (data) => {
      setFeedback({ kind: "success", exportId: data.id });
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  if (!canGenerate) {
    return null;
  }

  function handleConfirm() {
    setFeedback(null);
    create.mutate({
      reportType,
      paramsJson: {},
      paperSize,
    });
  }

  function handleClose() {
    setOpen(false);
    setFeedback(null);
    setReportType("coverage");
    setPaperSize("A4");
    create.reset();
  }

  function handleReportTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setReportType(e.target.value as ReportType);
  }

  function handlePaperSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPaperSize(e.target.value as PaperSize);
  }

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
      <Button
        data-testid="generate-report-button"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Generate Report
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Report</DialogTitle>
          <DialogDescription>
            Queues an asynchronous PDF render. You can track progress and
            download the result from the Exports page once ready.
          </DialogDescription>
        </DialogHeader>

        {feedback?.kind === "success" ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Export queued (id: {feedback.exportId}).{" "}
            <Link
              href="/exports"
              className="underline underline-offset-4"
              data-testid="generate-report-go-to-exports"
            >
              View in Exports
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-type">Report type</Label>
              <select
                id="report-type"
                data-testid="report-type-select"
                value={reportType}
                onChange={handleReportTypeChange}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {REPORT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paper-size">Paper size</Label>
              <select
                id="paper-size"
                data-testid="paper-size-select"
                value={paperSize}
                onChange={handlePaperSizeChange}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PAPER_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {feedback?.kind === "error" && (
          <p className="text-sm text-destructive">{feedback.message}</p>
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
              data-testid="generate-report-confirm"
              onClick={handleConfirm}
              disabled={create.isPending}
            >
              {create.isPending ? "Queuing…" : "Generate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
