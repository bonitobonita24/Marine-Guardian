"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { GanttView } from "./_components/gantt-view";
import { AssignmentDialog } from "./_components/assignment-dialog";
import { DeleteAssignmentDialog } from "./_components/delete-assignment-dialog";
import { PeriodToolbar } from "./_components/period-toolbar";
import { buildPeriod, type Period } from "./_components/period";

export default function PatrolSchedulePage() {
  const [period, setPeriod] = useState<Period>(() => buildPeriod(new Date(), "biweekly"));
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

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-5/6" />
          <Skeleton className="h-10 w-4/6" />
        </div>
      ) : data === undefined || data.items.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            No scheduled patrols found. Add patrol schedules to see them here.
          </p>
        </div>
      ) : (
        <GanttView items={data.items} onMove={handleMove} />
      )}

      {!isPending && data !== undefined && data.items.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Manage assignments
          </h2>
          <ul className="divide-y rounded-lg border">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
                data-testid={`patrol-schedule-row-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.patrolArea.colorHex }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium">{item.rangerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.patrolArea.name} ·{" "}
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
            patrolAreaId: editTarget.patrolArea.id,
            rangerUserId: editTarget.ranger?.id ?? null,
            rangerName: editTarget.rangerName,
            scheduledStart: new Date(editTarget.scheduledStart),
            scheduledEnd: new Date(editTarget.scheduledEnd),
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
          areaName={deleteTarget.patrolArea.name}
        />
      ) : null}
    </div>
  );
}
