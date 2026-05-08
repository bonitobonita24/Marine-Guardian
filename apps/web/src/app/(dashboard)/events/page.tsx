"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  KanbanProvider,
  KanbanBoard,
  KanbanCards,
  KanbanCard,
  KanbanHeader,
  type DragEndEvent,
} from "@/components/kibo-ui/kanban";
import { trpc } from "@/lib/trpc/client";

type EventState = "new_event" | "active" | "resolved";

type KanbanEvent = {
  id: string;
  name: string;
  column: string;
  serialNumber: number | null;
  priority: number;
  reportedByName: string | null;
  reportedAt: Date | null;
  eventType: { display: string; category: string } | null;
};

const columns = [
  { id: "new_event" as const, name: "New" },
  { id: "active" as const, name: "Active" },
  { id: "resolved" as const, name: "Resolved" },
];

function priorityVariant(priority: number) {
  if (priority >= 3) return "destructive" as const;
  if (priority === 2) return "default" as const;
  return "secondary" as const;
}

function priorityLabel(priority: number) {
  if (priority >= 3) return "Critical";
  if (priority === 2) return "High";
  if (priority === 1) return "Medium";
  return "Low";
}

function stateColor(state: string) {
  switch (state) {
    case "new_event":
      return "text-[hsl(var(--caution))]";
    case "active":
      return "text-[hsl(var(--info))]";
    case "resolved":
      return "text-[hsl(var(--success))]";
    default:
      return "text-muted-foreground";
  }
}

function columnCount(data: KanbanEvent[], columnId: string) {
  return data.filter((item) => item.column === columnId).length;
}

export default function EventsPage() {
  const eventsQuery = trpc.event.list.useQuery({ limit: 200 });
  const statsQuery = trpc.event.stats.useQuery();
  const updateState = trpc.event.updateState.useMutation();
  const utils = trpc.useUtils();

  const [data, setData] = useState<KanbanEvent[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (eventsQuery.data && !initialized) {
    const mapped = eventsQuery.data.items.map((event) => ({
      id: event.id,
      name: event.title,
      column: event.state,
      serialNumber: event.serialNumber,
      priority: event.priority,
      reportedByName: event.reportedByName,
      reportedAt: event.reportedAt,
      eventType: event.eventType,
    }));
    setData(mapped);
    setInitialized(true);
  }

  const handleDataChange = useCallback((newData: KanbanEvent[]) => {
    setData(newData);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event;
      const activeItem = data.find((item) => item.id === active.id);
      if (!activeItem) return;

      const newState = activeItem.column as EventState;
      updateState.mutate(
        { id: activeItem.id, state: newState },
        {
          onSuccess: () => {
            void utils.event.list.invalidate();
            void utils.event.stats.invalidate();
          },
          onError: () => {
            void eventsQuery.refetch().then((result) => {
              if (result.data) {
                setData(
                  result.data.items.map((e) => ({
                    id: e.id,
                    name: e.title,
                    column: e.state,
                    serialNumber: e.serialNumber,
                    priority: e.priority,
                    reportedByName: e.reportedByName,
                    reportedAt: e.reportedAt,
                    eventType: e.eventType,
                  }))
                );
              }
            });
          },
        }
      );
    },
    [data, updateState, utils, eventsQuery]
  );

  if (eventsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-sm text-muted-foreground">Loading events...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        {statsQuery.data !== undefined && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{statsQuery.data.total} total</span>
            <span className="h-4 w-px bg-border" />
            <span className={stateColor("new_event")}>
              {statsQuery.data.newEvents} new
            </span>
            <span className={stateColor("active")}>
              {statsQuery.data.active} active
            </span>
            <span className={stateColor("resolved")}>
              {statsQuery.data.resolved} resolved
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <KanbanProvider
          columns={columns}
          data={data}
          onDataChange={handleDataChange}
          onDragEnd={handleDragEnd}
        >
          {(column) => (
            <KanbanBoard key={column.id} id={column.id}>
              <KanbanHeader>
                <div className="flex items-center justify-between">
                  <span className={stateColor(column.id)}>
                    {column.name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {columnCount(data, column.id)}
                  </Badge>
                </div>
              </KanbanHeader>
              <KanbanCards<KanbanEvent> id={column.id}>
                {(event) => (
                  <KanbanCard key={event.id} id={event.id} name={event.name} column={event.column}>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">
                          {event.name}
                        </p>
                        <Badge
                          variant={priorityVariant(event.priority)}
                          className="shrink-0"
                        >
                          {priorityLabel(event.priority)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {event.serialNumber !== null && (
                          <span className="font-mono">
                            #{event.serialNumber}
                          </span>
                        )}
                        {event.eventType !== null && (
                          <>
                            <span className="h-3 w-px bg-border" />
                            <span>{event.eventType.display}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{event.reportedByName ?? "Unknown"}</span>
                        <span>
                          {event.reportedAt !== null
                            ? new Date(event.reportedAt).toLocaleDateString()
                            : ""}
                        </span>
                      </div>
                    </div>
                  </KanbanCard>
                )}
              </KanbanCards>
            </KanbanBoard>
          )}
        </KanbanProvider>
      </div>
    </div>
  );
}
