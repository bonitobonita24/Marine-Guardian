"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { RevisionTimeline } from "@/components/revisions/revision-timeline";

function StateBadge({ state }: { state: string }) {
  const variants: Record<string, "default" | "secondary" | "outline"> = {
    open: "default",
    done: "secondary",
    cancelled: "outline",
  };
  return (
    <Badge variant={variants[state] ?? "outline"} className="capitalize">
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

  const utils = trpc.useUtils();

  const patrolQuery = trpc.patrol.getById.useQuery(
    { id },
    { enabled: id !== "" },
  );

  // History tab — lazy: only fetched when the History tab is first activated.
  const [historyActive, setHistoryActive] = useState(false);
  const revisionsQuery = trpc.patrol.getRevisions.useQuery(
    { patrolId: id },
    { enabled: id !== "" && historyActive },
  );

  const updatePatrol = trpc.patrol.update.useMutation({
    onSuccess: () => {
      void utils.patrol.getById.invalidate({ id });
      void utils.patrol.getRevisions.invalidate({ patrolId: id });
    },
  });

  // Edit form state — seeded from server data.
  const [title, setTitle] = useState("");
  const [boatName, setBoatName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!patrolQuery.data) return;
    const p = patrolQuery.data;
    setTitle(p.title ?? "");
    setBoatName(p.boatName ?? "");
    setAreaName(p.areaName ?? "");
    setIsDirty(false);
  }, [patrolQuery.data]);

  const handleSave = () => {
    if (!patrolQuery.data) return;
    updatePatrol.mutate(
      { id, title, boatName, areaName },
      {
        onSuccess: () => {
          setIsDirty(false);
          setSaveSuccess(true);
          setTimeout(() => {
            setSaveSuccess(false);
          }, 2000);
        },
      },
    );
  };

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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.back();
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.back();
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to Patrols
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.back();
          }}
          className="mt-1 shrink-0"
          aria-label="Back to patrols list"
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {patrol.title ?? "(Untitled patrol)"}
            </h1>
            <StateBadge state={patrol.state} />
            {patrol.isTestPatrol && <Badge variant="secondary">Test</Badge>}
            {patrol.isDeleted && (
              <Badge variant="destructive">Deleted</Badge>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {patrol.id}
          </p>
        </div>
      </div>

      {/* ── Read-only key details ────────────────────────────────────────── */}
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Type
          </p>
          <p className="mt-1 capitalize">{patrol.patrolType}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Start
          </p>
          <p className="mt-1">{formatDate(patrol.startTime)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            End
          </p>
          <p className="mt-1">{formatDate(patrol.endTime)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            First seen
          </p>
          <p className="mt-1">{formatDate(patrol.firstSeenAt)}</p>
        </div>
      </div>

      {/* ── Edit / History tabs ──────────────────────────────────────────── */}
      <Tabs
        defaultValue="edit"
        onValueChange={(v) => {
          if (v === "history") setHistoryActive(true);
        }}
      >
        <TabsList>
          <TabsTrigger value="edit" className="min-h-[44px]">
            Edit
          </TabsTrigger>
          <TabsTrigger value="history" className="min-h-[44px]">
            Edit History
          </TabsTrigger>
        </TabsList>

        {/* Edit tab */}
        <TabsContent value="edit" className="space-y-4 pt-4">
          <p className="text-xs text-muted-foreground">
            Fields edited here are protected from future EarthRanger sync
            overwrites.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="patrol-title">Title</Label>
              <Input
                id="patrol-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setIsDirty(true);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patrol-boat">Boat name</Label>
              <Input
                id="patrol-boat"
                value={boatName}
                onChange={(e) => {
                  setBoatName(e.target.value);
                  setIsDirty(true);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patrol-area">Area name</Label>
              <Input
                id="patrol-area"
                value={areaName}
                onChange={(e) => {
                  setAreaName(e.target.value);
                  setIsDirty(true);
                }}
              />
            </div>
          </div>

          {updatePatrol.isError && (
            <p role="alert" className="text-sm text-destructive">
              {updatePatrol.error.message}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={updatePatrol.isPending || !isDirty}
              aria-label="Save patrol edits"
              className="min-h-[44px]"
            >
              {updatePatrol.isPending ? "Saving…" : "Save changes"}
            </Button>
            {saveSuccess && (
              <p
                className="text-sm text-[hsl(var(--success))]"
                aria-live="polite"
              >
                Saved.
              </p>
            )}
          </div>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="pt-4">
          <RevisionTimeline
            revisions={revisionsQuery.data?.revisions ?? []}
            erOriginalSnapshot={revisionsQuery.data?.erOriginalSnapshot ?? null}
            erSyncedAt={revisionsQuery.data?.erSyncedAt}
            isLoading={revisionsQuery.isLoading}
          />
        </TabsContent>
      </Tabs>

      {/* ── Segments ────────────────────────────────────────────────────── */}
      {patrol.segments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            Segments ({patrol.segments.length})
          </h2>
          <div className="divide-y rounded-lg border">
            {patrol.segments.map((seg) => (
              <div
                key={seg.id}
                className="flex flex-wrap items-center gap-4 p-4 text-sm"
              >
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

      {/* ── Accompanying rangers ─────────────────────────────────────────── */}
      {patrol.accompanyingRangers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            Accompanying rangers ({patrol.accompanyingRangers.length})
          </h2>
          <div className="divide-y rounded-lg border">
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
