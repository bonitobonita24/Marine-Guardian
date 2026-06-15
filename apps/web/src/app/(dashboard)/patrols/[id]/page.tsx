"use client";

import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

function StateBadge({ state }: { state: string }) {
  const variant =
    state === "open"
      ? ("default" as const)
      : state === "done"
        ? ("secondary" as const)
        : ("destructive" as const);
  return (
    <Badge variant={variant} className="capitalize">
      {state}
    </Badge>
  );
}

function formatDate(val: Date | string | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Date(val).toLocaleString();
}

export default function PatrolDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const patrolQuery = trpc.patrol.getById.useQuery(
    { id },
    { enabled: id !== "" },
  );

  if (patrolQuery.isLoading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Loading patrol…</p>
      </div>
    );
  }

  if (patrolQuery.isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Error</h1>
        <p className="text-sm text-destructive">{patrolQuery.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => { router.back(); }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Patrols
        </Button>
      </div>
    );
  }

  const patrol = patrolQuery.data;

  if (!patrol) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Patrol not found</h1>
        <p className="text-sm text-muted-foreground">
          This patrol does not exist or you do not have access to it.
        </p>
        <Button variant="outline" size="sm" onClick={() => { router.back(); }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Patrols
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { router.back(); }}
          className="mt-1 shrink-0"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {patrol.title ?? "(Untitled patrol)"}
            </h1>
            <StateBadge state={patrol.state} />
            {patrol.isTestPatrol && (
              <Badge variant="secondary">Test</Badge>
            )}
            {patrol.isDeleted && (
              <Badge variant="destructive">Deleted</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground font-mono">
            {patrol.id}
          </p>
        </div>
      </div>

      {/* Key details */}
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Type</p>
          <p className="mt-1 capitalize">{patrol.patrolType}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Start</p>
          <p className="mt-1">{formatDate(patrol.startTime)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">End</p>
          <p className="mt-1">{formatDate(patrol.endTime)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">First seen</p>
          <p className="mt-1">{formatDate(patrol.firstSeenAt)}</p>
        </div>
      </div>

      {/* Segments */}
      {patrol.segments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Segments ({patrol.segments.length})</h2>
          <div className="rounded-lg border divide-y">
            {patrol.segments.map((seg) => (
              <div key={seg.id} className="flex flex-wrap items-center gap-4 p-4 text-sm">
                <div className="min-w-[120px]">
                  <p className="text-xs text-muted-foreground">Leader</p>
                  <p>{seg.leaderName ?? "—"}</p>
                </div>
                <div className="min-w-[160px]">
                  <p className="text-xs text-muted-foreground">Actual start</p>
                  <p>{formatDate(seg.actualStart)}</p>
                </div>
                <div className="min-w-[160px]">
                  <p className="text-xs text-muted-foreground">Actual end</p>
                  <p>{formatDate(seg.actualEnd)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accompanying rangers */}
      {patrol.accompanyingRangers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            Accompanying rangers ({patrol.accompanyingRangers.length})
          </h2>
          <div className="rounded-lg border divide-y">
            {patrol.accompanyingRangers.map((r) => {
              const name =
                r.registeredUser?.fullName ??
                r.knownRanger?.name ??
                r.freetextName ??
                "Unknown";
              return (
                <div key={r.id} className="flex items-center gap-3 p-4 text-sm">
                  <span className="font-medium">{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
