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
  fromDate: Date;
  range?: "daily" | "monthly";
  onMove?: (id: string, startAt: Date, endAt: Date | null) => void;
};

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

/** One synthetic sidebar feature per ranger — drives the sidebar row label. */
function toRangerSidebarFeature(
  rangerName: string,
  items: ScheduleItem[],
): GanttFeature {
  const first = items[0];
  const startAt = first ? new Date(first.scheduledStart) : new Date();
  const endAt = first ? new Date(first.scheduledEnd) : new Date();
  return {
    id: `ranger:${rangerName}`,
    name: rangerName,
    startAt,
    endAt,
    status: { id: "ranger", name: "Ranger", color: "#94a3b8" },
  };
}

export function GanttView({ items, fromDate, range = "daily", onMove }: Props) {
  const grouped = groupByRanger(items);
  const rangers = Array.from(grouped.keys());

  return (
    <div className="h-[600px] overflow-hidden rounded-lg border">
      <GanttProvider range={range} scrollToDate={fromDate}>
        <GanttSidebar>
          <GanttSidebarGroup name="Rangers">
            {rangers.map((rangerName) => {
              const rangerItems = grouped.get(rangerName) ?? [];
              return (
                <GanttSidebarItem
                  key={`ranger:${rangerName}`}
                  feature={toRangerSidebarFeature(rangerName, rangerItems)}
                />
              );
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
