"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { RangerProfileHeader } from "@/components/rangers/ranger-profile-header";
import { RangerKpiCards } from "@/components/rangers/ranger-kpi-cards";
import { RangerEventSummary } from "@/components/rangers/ranger-event-summary";
import { RangerActivityTimeline } from "@/components/rangers/ranger-activity-timeline";

export default function RangerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const rangerQuery = trpc.ranger.getById.useQuery(
    { id },
    { enabled: id !== "" },
  );

  if (rangerQuery.isLoading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Loading ranger…</p>
      </div>
    );
  }

  if (rangerQuery.isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Ranger not found</h1>
        <p className="text-sm text-muted-foreground">
          {rangerQuery.error.message}
        </p>
      </div>
    );
  }

  if (!rangerQuery.data) {
    return null;
  }

  const { profile, eventStats, patrolStats, recentActivity } = rangerQuery.data;

  return (
    <div className="space-y-6">
      <RangerProfileHeader profile={profile} />
      <RangerKpiCards patrolStats={patrolStats} />
      <RangerEventSummary eventStats={eventStats} />
      <RangerActivityTimeline recentActivity={recentActivity} />
    </div>
  );
}
