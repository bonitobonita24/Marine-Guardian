"use client";

import {
  GanttProvider,
  GanttSidebar,
  GanttSidebarGroup,
  GanttSidebarItem,
  GanttTimeline,
  GanttHeader,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttFeatureRow,
  GanttToday,
  type GanttFeature,
} from "@/components/kibo-ui/gantt";

type ScheduleItem = {
  id: string;
  rangerName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  patrolArea: { id: string; name: string; colorHex: string };
  ranger: { id: string; fullName: string } | null;
};

type Props = {
  items: ScheduleItem[];
  onMove?: (id: string, startAt: Date, endAt: Date | null) => void;
};

/** Group items by rangerName for sidebar rows. */
function groupByRanger(items: ScheduleItem[]): Map<string, ScheduleItem[]> {
  const map = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const key = item.rangerName;
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/** Convert a schedule item to a GanttFeature. Color comes from the patrol area. */
function toGanttFeature(item: ScheduleItem): GanttFeature {
  return {
    id: item.id,
    name: item.patrolArea.name,
    startAt: new Date(item.scheduledStart),
    endAt: new Date(item.scheduledEnd),
    status: {
      id: item.patrolArea.id,
      name: item.patrolArea.name,
      color: item.patrolArea.colorHex,
    },
  };
}

export function GanttView({ items, onMove }: Props) {
  const grouped = groupByRanger(items);
  const rangers = Array.from(grouped.keys());

  return (
    <div className="h-[600px] overflow-hidden rounded-lg border">
      <GanttProvider range="daily">
        <GanttSidebar>
          <GanttSidebarGroup name="Rangers">
            {rangers.map((rangerName) => {
              const rangerItems = grouped.get(rangerName) ?? [];
              return rangerItems.map((item) => (
                <GanttSidebarItem
                  key={item.id}
                  feature={toGanttFeature(item)}
                />
              ));
            })}
          </GanttSidebarGroup>
        </GanttSidebar>

        <GanttTimeline>
          <GanttHeader />
          <GanttFeatureList>
            {rangers.map((rangerName) => {
              const rangerItems = grouped.get(rangerName) ?? [];
              const features = rangerItems.map(toGanttFeature);
              return (
                <GanttFeatureListGroup key={rangerName}>
                  <GanttFeatureRow features={features} {...(onMove ? { onMove } : {})} />
                </GanttFeatureListGroup>
              );
            })}
          </GanttFeatureList>
          <GanttToday />
        </GanttTimeline>
      </GanttProvider>
    </div>
  );
}
