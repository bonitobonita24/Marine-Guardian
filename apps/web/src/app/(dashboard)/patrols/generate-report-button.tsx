"use client";

// 5.3d — Generate Report CTA on the Patrols page. Coordinator+ (super_admin /
// site_admin / field_coordinator) can fire a reportExport.create which inserts
// a queued row + enqueues the BullMQ pdf-render job + writes EXPORT_REQUESTED
// audit. Hidden from operator sessions client-side; server enforces via
// coordinatorProcedure.
//
// On success, surfaces a link to /exports where the user can poll status +
// download the result once ready.
//
// 6.2d — Per Area Report payload wiring. When reportType === "area", the
// dialog reveals area selector + startDate + endDate inputs. paramsJson is
// emitted as { areaBoundaryId, startDate, endDate } matching parsePerAreaParams
// in @/server/per-area-report/get-per-area-report-data.ts. All other
// reportTypes continue to emit {} (no per-area shape change).
//
// P1-D fix — Coverage Report period picker. The coverage report defaults to
// "monthly" (most recent 30 days) which may have no GPS-tracked patrols.
// When reportType === "coverage", the dialog now exposes year + month inputs
// so the user can target a period with real computed_distance_km / GPS data.
// paramsJson is emitted as { category: "monthly", year, month } matching
// parseCoverageParams in get-coverage-report-data.ts.

import { useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import {
  PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE,
  useIsPlatformAdminWithoutTenant,
} from "@/lib/auth/use-platform-admin-empty-context";

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
  const isPlatformAdminWithoutTenant = useIsPlatformAdminWithoutTenant();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("coverage");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  // 6.2d — area-specific fields, only used when reportType === "area".
  const [areaBoundaryId, setAreaBoundaryId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  // P1-D — coverage period picker: year + month, only used when reportType === "coverage".
  const now = new Date();
  const [coverageYear, setCoverageYear] = useState<number>(now.getFullYear());
  const [coverageMonth, setCoverageMonth] = useState<number>(now.getMonth() + 1);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; exportId: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const roles = session?.user.roles ?? [];
  const canGenerate =
    roles.includes("super_admin") ||
    roles.includes("site_admin") ||
    roles.includes("field_coordinator") ||
    roles.includes("administrator");

  // 6.2d — area-list fetch is gated on dialog open to avoid burning a trpc
  // call on every Patrols page load. List is filtered to enabled areas
  // (overrideOfficial:true rows + custom rows that are isEnabled) — matches
  // the existing areaBoundary.list filter shape from 5.1e.
  const areaList = trpc.areaBoundary.list.useQuery(
    { isEnabled: true, limit: 200 },
    { enabled: open && canGenerate },
  );

  const create = trpc.reportExport.create.useMutation({
    onSuccess: (data) => {
      setFeedback({ kind: "success", exportId: data.id });
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  // BUG-1 FIX: useRef MUST be called unconditionally before any early return.
  // Previously this was placed after `if (!canGenerate) return null`, which
  // violated React's Rules of Hooks and caused minified error #310 at runtime.
  const REQUEST_TIMEOUT_MS = 15000;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!canGenerate) {
    return null;
  }

  // 6.2d — paramsJson shape is reportType-discriminated. Only "area" carries
  // a payload today; coverage emits { category, year, month } (P1-D period
  // picker); other reportTypes pass {}.
  const isAreaReport = reportType === "area";
  const isCoverageReport = reportType === "coverage";
  const areaFieldsComplete =
    areaBoundaryId.length > 0 && startDate.length > 0 && endDate.length > 0;
  const confirmDisabled =
    create.isPending || (isAreaReport && !areaFieldsComplete);

  function buildParamsJson(): Record<string, unknown> {
    if (isAreaReport) {
      return {
        areaBoundaryId,
        startDate,
        endDate,
      };
    }
    if (isCoverageReport) {
      return {
        category: "monthly",
        year: coverageYear,
        month: coverageMonth,
      };
    }
    return {};
  }

  function clearRequestTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function handleConfirm() {
    setFeedback(null);
    clearRequestTimeout();
    timeoutRef.current = setTimeout(() => {
      // Only trip if the mutation is still in flight.
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
        reportType,
        paramsJson: buildParamsJson(),
        paperSize,
      },
      {
        onSettled: () => {
          clearRequestTimeout();
        },
      }
    );
  }

  function handleClose() {
    clearRequestTimeout();
    setOpen(false);
    setFeedback(null);
    setReportType("coverage");
    setPaperSize("A4");
    setAreaBoundaryId("");
    setStartDate("");
    setEndDate("");
    // P1-D — reset coverage period to current month on close.
    const n = new Date();
    setCoverageYear(n.getFullYear());
    setCoverageMonth(n.getMonth() + 1);
    create.reset();
  }

  function handleReportTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ReportType;
    setReportType(next);
    // 6.2d — clear area-specific state whenever the user moves off "area".
    if (next !== "area") {
      setAreaBoundaryId("");
      setStartDate("");
      setEndDate("");
    }
  }

  function handleCoverageYearChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v)) setCoverageYear(v);
  }

  function handleCoverageMonthChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setCoverageMonth(parseInt(e.target.value, 10));
  }

  function handlePaperSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPaperSize(e.target.value as PaperSize);
  }

  function handleAreaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setAreaBoundaryId(e.target.value);
  }

  function handleStartDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setStartDate(e.target.value);
  }

  function handleEndDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEndDate(e.target.value);
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

            {isCoverageReport && (
              <div
                className="space-y-3 rounded-md border border-input bg-muted/30 p-3"
                data-testid="coverage-report-fields"
              >
                <p className="text-xs text-muted-foreground">
                  Choose the month to cover. KMS and duration appear only for
                  patrols with a GPS track recorded in EarthRanger.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="coverage-year">Year</Label>
                    <Input
                      id="coverage-year"
                      data-testid="coverage-year-input"
                      type="number"
                      min={2020}
                      max={new Date().getFullYear()}
                      value={coverageYear}
                      onChange={handleCoverageYearChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="coverage-month">Month</Label>
                    <select
                      id="coverage-month"
                      data-testid="coverage-month-select"
                      value={coverageMonth}
                      onChange={handleCoverageMonthChange}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {[
                        "January", "February", "March", "April",
                        "May", "June", "July", "August",
                        "September", "October", "November", "December",
                      ].map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {isAreaReport && (
              <div
                className="space-y-3 rounded-md border border-input bg-muted/30 p-3"
                data-testid="area-report-fields"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="area-boundary">Area</Label>
                  <select
                    id="area-boundary"
                    data-testid="area-boundary-select"
                    value={areaBoundaryId}
                    onChange={handleAreaChange}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">
                      {areaList.isLoading
                        ? "Loading areas…"
                        : (areaList.data?.items.length ?? 0) > 0
                          ? "Select an area…"
                          : isPlatformAdminWithoutTenant
                            ? "No tenant context"
                            : "No areas available"}
                    </option>
                    {areaList.data?.items.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                  {!areaList.isLoading &&
                    (areaList.data?.items.length ?? 0) === 0 &&
                    isPlatformAdminWithoutTenant && (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid="area-boundary-platform-admin-hint"
                      >
                        {PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE}
                      </p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="area-start-date">Start date</Label>
                    <Input
                      id="area-start-date"
                      data-testid="area-start-date-input"
                      type="date"
                      value={startDate}
                      onChange={handleStartDateChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="area-end-date">End date</Label>
                    <Input
                      id="area-end-date"
                      data-testid="area-end-date-input"
                      type="date"
                      value={endDate}
                      onChange={handleEndDateChange}
                    />
                  </div>
                </div>
              </div>
            )}
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
              disabled={confirmDisabled}
            >
              {create.isPending ? "Queuing…" : "Generate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
