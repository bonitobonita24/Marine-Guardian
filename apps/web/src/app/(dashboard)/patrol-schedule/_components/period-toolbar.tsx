"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  stepPeriod,
  formatPeriodLabel,
  buildPeriod,
  type Period,
} from "./period";

type Props = {
  period: Period;
  onChange: (next: Period) => void;
};

export function PeriodToolbar({ period, onChange }: Props) {
  const midpoint = new Date(
    period.from.getTime() +
      (period.to.getTime() - period.from.getTime()) / 2,
  );

  function handleViewChange(value: string) {
    if (value === "biweekly" || value === "monthly") {
      onChange(buildPeriod(midpoint, value));
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
      data-testid="period-toolbar"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous period"
          data-testid="period-toolbar-prev"
          onClick={() => { onChange(stepPeriod(period, -1)); }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 px-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span
            className="text-sm font-medium"
            data-testid="period-toolbar-label"
          >
            {formatPeriodLabel(period)}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          data-testid="period-toolbar-today"
          onClick={() => { onChange(buildPeriod(new Date(), period.view)); }}
        >
          Today
        </Button>

        <Button
          variant="outline"
          size="icon"
          aria-label="Next period"
          data-testid="period-toolbar-next"
          onClick={() => { onChange(stepPeriod(period, 1)); }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={period.view} onValueChange={handleViewChange}>
        <TabsList>
          <TabsTrigger
            value="biweekly"
            data-testid="period-toolbar-tab-biweekly"
          >
            Bi-weekly
          </TabsTrigger>
          <TabsTrigger
            value="monthly"
            data-testid="period-toolbar-tab-monthly"
          >
            Monthly
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
