"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type ScheduleItem = {
  id: string;
  rangerName: string;
  scheduledStart: Date;
  patrolArea: { id: string; name: string; colorHex: string } | null;
};

type Props<T extends ScheduleItem> = {
  items: T[];
  /** Any date within the month to render — the month grid is derived from this. */
  anchorDate: Date;
  onSelect: (item: T) => void;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NO_AREA_COLOR = "#94a3b8"; // slate-400

type DayCell = { date: Date; inMonth: boolean };

/** Builds a 6-week (42-day) grid covering the calendar month containing `anchor`,
 *  using UTC calendar math to match the rest of the patrol-schedule period logic. */
function buildMonthGrid(anchor: Date): DayCell[] {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const gridStart = new Date(
    Date.UTC(year, month, 1 - startWeekday),
  );

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getTime() + i * 24 * 60 * 60 * 1000);
    cells.push({ date, inMonth: date.getUTCMonth() === month });
  }
  return cells;
}

function dayKey(date: Date): string {
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth())}-${String(date.getUTCDate())}`;
}

export function CalendarView<T extends ScheduleItem>({
  items,
  anchorDate,
  onSelect,
}: Props<T>) {
  const grid = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = dayKey(new Date(item.scheduledStart));
      const existing = map.get(key);
      if (existing) {
        existing.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return map;
  }, [items]);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(anchorDate);

  return (
    <div
      className="space-y-2 rounded-lg border p-3"
      data-testid="patrol-schedule-calendar-view"
    >
      <p className="text-sm font-medium">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-muted px-1.5 py-1 text-center font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {grid.map((cell) => {
          const key = dayKey(cell.date);
          const dayItems = itemsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              data-testid={`patrol-schedule-calendar-day-${key}`}
              className={cn(
                "min-h-24 space-y-1 bg-background p-1.5",
                !cell.inMonth && "bg-muted/40 text-muted-foreground",
              )}
            >
              <p className="text-[11px] font-medium">{cell.date.getUTCDate()}</p>
              <div className="space-y-1">
                {dayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`patrol-schedule-calendar-chip-${item.id}`}
                    onClick={() => { onSelect(item); }}
                    className="flex w-full items-center gap-1 rounded-sm bg-muted px-1 py-0.5 text-left text-[11px] hover:bg-accent"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: item.patrolArea?.colorHex ?? NO_AREA_COLOR,
                      }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.rangerName}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
