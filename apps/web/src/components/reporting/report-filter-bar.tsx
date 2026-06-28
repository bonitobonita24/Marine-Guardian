"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useReportFilter } from "./report-filter-context";

/**
 * Interactive Report Map filter bar (2026-06-27).
 *
 * From/To native date inputs + a municipality Select, all bound to the shared
 * {@link useReportFilter} context so every panel re-queries in lock-step. Native
 * date inputs keep us dependency-free (same pattern as the dashboard's
 * date-range-header); each control carries an explicit <label> for WCAG 2.2 AA.
 *
 * The municipality options are loaded from `municipality.list`. The "all"
 * sentinel maps to a null municipalityId (Radix Select forbids an empty-string
 * value, so we cannot use "" for the all-municipalities option).
 */

const ALL_MUNICIPALITIES = "all";

/**
 * Format a Date as the `yyyy-MM-dd` value a native date input expects, using
 * LOCAL calendar fields (not UTC) so the displayed day matches the operator's
 * timezone — toISOString() would shift the date across the UTC boundary.
 */
function toDateInputValue(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReportFilterBar({
  layout = "bar",
}: {
  /** "bar" = bordered horizontal toolbar (default). "stacked" = borderless
   *  vertical layout for embedding in the floating map-controls card. */
  layout?: "bar" | "stacked";
} = {}) {
  const { from, to, municipalityId, setRange, setMunicipalityId, resetTo30d } =
    useReportFilter();
  const stacked = layout === "stacked";

  const municipalities = trpc.municipality.list.useQuery();

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return; // ignore cleared input
    const next = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(next.getTime())) return;
    setRange({ from: next, to });
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    // Local end-of-day so the TO bound is inclusive of the chosen day.
    const next = new Date(`${raw}T23:59:59.999`);
    if (Number.isNaN(next.getTime())) return;
    setRange({ from, to: next });
  };

  const handleMunicipalityChange = (value: string) => {
    setMunicipalityId(value === ALL_MUNICIPALITIES ? null : value);
  };

  const fieldClass = cn(
    "flex",
    stacked ? "flex-col items-start gap-0.5" : "items-center gap-1.5",
  );

  return (
    <div
      role="region"
      aria-label="Report map filters"
      className={cn(
        stacked
          ? "flex flex-col gap-1"
          : "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2",
      )}
    >
      <div className={cn(stacked ? "grid grid-cols-2 gap-1" : "contents")}>
        <div className={fieldClass}>
          <Label
            htmlFor="report-range-from"
            className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            From
          </Label>
          <Input
            id="report-range-from"
            data-testid="report-range-from"
            type="date"
            className={cn(
              stacked ? "h-7 w-full text-[11px]" : "h-8 w-[8.5rem] text-xs",
            )}
            value={toDateInputValue(from)}
            max={toDateInputValue(to)}
            onChange={handleFromChange}
          />
        </div>

        <div className={fieldClass}>
          <Label
            htmlFor="report-range-to"
            className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            To
          </Label>
          <Input
            id="report-range-to"
            data-testid="report-range-to"
            type="date"
            className={cn(
              stacked ? "h-7 w-full text-[11px]" : "h-8 w-[8.5rem] text-xs",
            )}
            value={toDateInputValue(to)}
            min={toDateInputValue(from)}
            onChange={handleToChange}
          />
        </div>
      </div>

      <div className={fieldClass}>
        <Label
          htmlFor="report-municipality"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          Municipality
        </Label>
        <Select
          value={municipalityId ?? ALL_MUNICIPALITIES}
          onValueChange={handleMunicipalityChange}
        >
          <SelectTrigger
            id="report-municipality"
            data-testid="report-municipality"
            className={cn(stacked ? "h-7 w-full text-[11px]" : "h-8 w-[12rem] text-xs")}
          >
            <SelectValue placeholder="All municipalities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MUNICIPALITIES}>All municipalities</SelectItem>
            {(municipalities.data ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(stacked ? "h-7 w-full text-xs" : "h-8")}
        onClick={resetTo30d}
        data-testid="report-filter-reset"
      >
        <RotateCcw aria-hidden="true" />
        Last 30 days
      </Button>
    </div>
  );
}
