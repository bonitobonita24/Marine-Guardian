"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDashboardRange } from "./range-context";

/**
 * WAR ROOM FROM/TO range header (2026-06-25, goal items 3-4 / T3).
 *
 * Two native <input type="date"> controls bound to the shared dashboard range
 * plus a "Last 7 days" reset. Native inputs keep us dependency-free (no calendar
 * popover package). Each control carries an explicit <label> for WCAG 2.2 AA.
 */

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

export function DateRangeHeader() {
  const { from, to, setRange, resetTo7d } = useDashboardRange();

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return; // ignore cleared input
    // Parse as local midnight; combine with current `to`.
    const next = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(next.getTime())) return;
    setRange({ from: next, to });
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    // Parse as local end-of-day so the TO bound is inclusive of the chosen day.
    const next = new Date(`${raw}T23:59:59.999`);
    if (Number.isNaN(next.getTime())) return;
    setRange({ from, to: next });
  };

  return (
    <div
      role="region"
      aria-label="Dashboard date range"
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5"
    >
      <div className="flex items-center gap-1.5">
        <Label
          htmlFor="dashboard-range-from"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          From
        </Label>
        <Input
          id="dashboard-range-from"
          data-testid="dashboard-range-from"
          type="date"
          className="h-7 w-[8.5rem] text-xs"
          value={toDateInputValue(from)}
          max={toDateInputValue(to)}
          onChange={handleFromChange}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label
          htmlFor="dashboard-range-to"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          To
        </Label>
        <Input
          id="dashboard-range-to"
          data-testid="dashboard-range-to"
          type="date"
          className="h-7 w-[8.5rem] text-xs"
          value={toDateInputValue(to)}
          min={toDateInputValue(from)}
          onChange={handleToChange}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={resetTo7d}
        data-testid="dashboard-range-reset"
      >
        <RotateCcw aria-hidden="true" />
        Last 7 days
      </Button>
    </div>
  );
}
