"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { GanttView } from "./_components/gantt-view";

export default function PatrolSchedulePage() {
  const { data, isPending } = trpc.patrolSchedule.list.useQuery({ limit: 200 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patrol Schedule</h1>
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-5/6" />
          <Skeleton className="h-10 w-4/6" />
        </div>
      ) : !data?.items.length ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            No scheduled patrols found. Add patrol schedules to see them here.
          </p>
        </div>
      ) : (
        <GanttView items={data.items} />
      )}
    </div>
  );
}
