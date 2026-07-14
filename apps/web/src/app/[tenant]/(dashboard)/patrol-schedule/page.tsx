"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { GanttView } from "./_components/gantt-view";
import { CalendarView } from "./_components/calendar-view";
import { KanbanView } from "./_components/kanban-view";
import { MapView } from "./_components/map-view";
import { AssignmentDialog } from "./_components/assignment-dialog";
import { DeleteAssignmentDialog } from "./_components/delete-assignment-dialog";
import { PeriodToolbar } from "./_components/period-toolbar";
import { buildPeriod, type Period } from "./_components/period";
import type { PlannedTrackGeoJSON } from "./_components/planned-track-draw";

type ScheduleView = "calendar" | "kanban" | "map" | "gantt";

export default function PatrolSchedulePage() {
  const [period, setPeriod] = useState<Period>(() => buildPeriod(new Date(), "biweekly"));
  const [view, setView] = useState<ScheduleView>("calendar");
  const utils = trpc.useUtils();
  const { data, isPending } = trpc.patrolSchedule.list.useQuery({
    limit: 200,
    from: period.from,
    to: period.to,
  });
  const updateMutation = trpc.patrolSchedule.update.useMutation({
    onSuccess: () => {
      void utils.patrolSchedule.list.invalidate();
    },
  });

  const handleMove = (id: string, startAt: Date, endAt: Date | null): void => {
    if (endAt === null) {
      return;
    }
    updateMutation.mutate({
      id,
      scheduledStart: startAt,
      scheduledEnd: endAt,
    });
  };

  type ScheduleRow = NonNullable<typeof data>["items"][number];

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patrol Schedule</h1>
        <Button
          onClick={() => { setCreateOpen(true); }}
          data-testid="patrol-schedule-add-button"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add assignment
        </Button>
      </div>

      <PeriodToolbar period={period} onChange={setPeriod} />

      <Tabs value={view} onValueChange={(v) => { setView(v as ScheduleView); }}>
        <TabsList data-testid="patrol-schedule-view-switcher">
          <TabsTrigger value="calendar" data-testid="patrol-schedule-view-calendar">
            Calendar
          </TabsTrigger>
          <TabsTrigger value="kanban" data-testid="patrol-schedule-view-kanban">
            Kanban
          </TabsTrigger>
          <TabsTrigger value="map" data-testid="patrol-schedule-view-map">
            Map
          </TabsTrigger>
          <TabsTrigger value="gantt" data-testid="patrol-schedule-view-gantt">
            Gantt
          </TabsTrigger>
        </TabsList>

        {isPending ? (
          <div className="space-y-3 mt-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-5/6" />
            <Skeleton className="h-10 w-4/6" />
          </div>
        ) : items.length === 0 ? (
          <div className="mt-2 flex h-64 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              No scheduled patrols found. Add patrol schedules to see them here.
            </p>
          </div>
        ) : (
          <>
            <TabsContent value="calendar">
              <CalendarView
                items={items}
                anchorDate={period.from}
                onSelect={(item) => { setEditTarget(item); }}
              />
            </TabsContent>
            <TabsContent value="kanban">
              <KanbanView items={items} onSelect={(item) => { setEditTarget(item); }} />
            </TabsContent>
            <TabsContent value="map">
              <MapView items={items} onSelect={(item) => { setEditTarget(item); }} />
            </TabsContent>
            <TabsContent value="gantt">
              <GanttView
                items={items}
                fromDate={period.from}
                range={period.view === "monthly" ? "monthly" : "daily"}
                onMove={handleMove}
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      {!isPending && items.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Manage assignments
          </h2>
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
                data-testid={`patrol-schedule-row-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  {item.patrolArea !== null ? (
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.patrolArea.colorHex }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <div>
                    <p className="font-medium">{item.rangerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.patrolArea?.name ?? "No area"} ·{" "}
                      {new Date(item.scheduledStart).toLocaleDateString()} –{" "}
                      {new Date(item.scheduledEnd).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditTarget(item); }}
                    data-testid={`patrol-schedule-edit-${item.id}`}
                    aria-label="Edit assignment"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDeleteTarget(item); }}
                    data-testid={`patrol-schedule-delete-${item.id}`}
                    aria-label="Delete assignment"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AssignmentDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => { setCreateOpen(false); }}
      />
      {editTarget !== null ? (
        <AssignmentDialog
          mode="edit"
          open={true}
          onOpenChange={(o) => {
            if (!o) { setEditTarget(null); }
          }}
          onSuccess={() => { setEditTarget(null); }}
          initial={{
            id: editTarget.id,
            patrolAreaId: editTarget.patrolArea?.id ?? null,
            rangerUserId: editTarget.ranger?.id ?? null,
            rangerName: editTarget.rangerName,
            accompanyingRangers: Array.isArray(editTarget.accompanyingRangers)
              ? (editTarget.accompanyingRangers as { userId?: string; name: string }[])
              : null,
            scheduledStart: new Date(editTarget.scheduledStart),
            plannedHours: editTarget.plannedHours ?? null,
            plannedTrackGeojson: editTarget.plannedTrackGeojson as
              | PlannedTrackGeoJSON
              | null,
            notes: editTarget.notes ?? null,
          }}
        />
      ) : null}
      {deleteTarget !== null ? (
        <DeleteAssignmentDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) { setDeleteTarget(null); }
          }}
          onSuccess={() => { setDeleteTarget(null); }}
          id={deleteTarget.id}
          rangerName={deleteTarget.rangerName}
          areaName={deleteTarget.patrolArea?.name ?? "No area"}
        />
      ) : null}
    </div>
  );
}
