"use client";

import { useState, type DragEvent } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export type ScheduleStatus = "planned" | "in_progress" | "completed" | "cancelled";

type AccompanyingRanger = { userId?: string; name: string };

type ScheduleItem = {
  id: string;
  rangerName: string;
  scheduledStart: Date;
  plannedHours: number | null;
  status: string;
  accompanyingRangers?: unknown;
  patrolArea: { id: string; name: string; colorHex: string } | null;
};

type Props<T extends ScheduleItem> = {
  items: T[];
  onSelect: (item: T) => void;
};

const COLUMNS: { status: ScheduleStatus; label: string }[] = [
  { status: "planned", label: "Planned" },
  { status: "in_progress", label: "In progress" },
  { status: "completed", label: "Completed" },
  { status: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function accompanyingCount(value: unknown): number {
  return Array.isArray(value) ? (value as AccompanyingRanger[]).length : 0;
}

function formatStart(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function KanbanView<T extends ScheduleItem>({ items, onSelect }: Props<T>) {
  const utils = trpc.useUtils();
  const [dragOverStatus, setDragOverStatus] = useState<ScheduleStatus | null>(null);

  const setStatus = trpc.patrolSchedule.setStatus.useMutation({
    onSuccess: () => {
      void utils.patrolSchedule.list.invalidate();
    },
  });

  function changeStatus(id: string, status: ScheduleStatus) {
    setStatus.mutate({ id, status });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, status: ScheduleStatus) {
    e.preventDefault();
    setDragOverStatus(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id === "") return;
    changeStatus(id, status);
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="patrol-schedule-kanban-view"
    >
      {COLUMNS.map((column) => {
        const columnItems = items.filter((item) => item.status === column.status);
        return (
          <div
            key={column.status}
            data-testid={`patrol-schedule-kanban-column-${column.status}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(column.status);
            }}
            onDragLeave={() => {
              setDragOverStatus((prev) => (prev === column.status ? null : prev));
            }}
            onDrop={(e) => { handleDrop(e, column.status); }}
            className={cn(
              "flex min-h-40 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors",
              dragOverStatus === column.status && "border-primary bg-muted/60",
            )}
          >
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium">{column.label}</p>
              <Badge variant="secondary" data-testid={`patrol-schedule-kanban-count-${column.status}`}>
                {columnItems.length}
              </Badge>
            </div>
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {columnItems.map((item) => (
                <Card
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", item.id);
                  }}
                  onClick={() => { onSelect(item); }}
                  data-testid={`patrol-schedule-kanban-card-${item.id}`}
                  className="cursor-grab gap-2 py-3 active:cursor-grabbing"
                >
                  <CardHeader className="gap-1 px-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: item.patrolArea?.colorHex ?? "#94a3b8",
                        }}
                        aria-hidden="true"
                      />
                      <p className="truncate text-sm font-medium">{item.rangerName}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1.5 px-3 text-xs text-muted-foreground">
                    <p>{item.patrolArea?.name ?? "No area"}</p>
                    <p>{formatStart(new Date(item.scheduledStart))}</p>
                    <div className="flex items-center justify-between">
                      <span>
                        {item.plannedHours !== null ? `${String(item.plannedHours)}h planned` : "No planned hours"}
                      </span>
                      {accompanyingCount(item.accompanyingRangers) > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{accompanyingCount(item.accompanyingRangers)}
                        </Badge>
                      )}
                    </div>
                    {/* Accessible fallback for changing status without drag-and-drop */}
                    <Select
                      value={item.status}
                      onValueChange={(next) => {
                        changeStatus(item.id, next as ScheduleStatus);
                      }}
                    >
                      <SelectTrigger
                        onClick={(e) => { e.stopPropagation(); }}
                        className="h-7 text-xs"
                        data-testid={`patrol-schedule-kanban-status-select-${item.id}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent onClick={(e) => { e.stopPropagation(); }}>
                        {COLUMNS.map((c) => (
                          <SelectItem key={c.status} value={c.status}>
                            {STATUS_LABEL[c.status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              ))}
              {columnItems.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  No assignments
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
