"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers";
import { useTenantSlug } from "@/lib/routing/use-tenant-slug";
import { tenantHref } from "@/lib/routing/tenant-href";
type PatrolListItem = inferRouterOutputs<AppRouter>["patrol"]["list"]["items"][number];

type StateFilter = "all" | "open" | "done" | "cancelled";
type TypeFilter = "all" | "foot" | "seaborne";

export function PatrolsTable() {
  const router = useRouter();
  const tenant = useTenantSlug();
  const { data: session } = useSession();
  const roles = session?.user.roles ?? [];
  // Phase 7 soft-delete — delete/restore actions + the "Show deleted" toggle
  // are admin-only. Mirrors the 5.2c rebuild-tracks-button gating pattern.
  const canManage =
    roles.includes("tenant_manager") ||
    roles.includes("tenant_superadmin") ||
    roles.includes("tenant_admin");

  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [includeTest, setIncludeTest] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const [accumulated, setAccumulated] = useState<PatrolListItem[]>([]);

  // Pending delete confirmation target (destructive op → confirm dialog).
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string | null;
  } | null>(null);

  // Pending municipality-override target.
  const [overrideTarget, setOverrideTarget] = useState<{
    id: string;
    title: string | null;
    current: string | null;
    manual: boolean;
  } | null>(null);
  const [selectedMuni, setSelectedMuni] = useState<string>("");

  // When filters change, reset accumulated + cursor
  useEffect(() => {
    setAccumulated([]);
    setCursor(undefined);
  }, [stateFilter, typeFilter, includeTest, includeDeleted]);

  const listQuery = trpc.patrol.list.useQuery({
    limit: 50,
    cursor,
    ...(stateFilter !== "all" ? { state: stateFilter } : {}),
    ...(typeFilter !== "all" ? { patrolType: typeFilter } : {}),
    includeTest,
    includeDeleted,
  });

  // After a delete or restore, reset to the first page and refetch so the
  // mutated row disappears (or its Deleted badge updates) without a reload.
  function refreshList() {
    setAccumulated([]);
    setCursor(undefined);
    void listQuery.refetch();
  }

  const softDelete = trpc.patrol.softDelete.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      refreshList();
    },
  });

  const restore = trpc.patrol.restore.useMutation({
    onSuccess: () => {
      refreshList();
    },
  });

  const muniQuery = trpc.municipality.list.useQuery(undefined, {
    enabled: overrideTarget !== null,
  });

  const setOverride = trpc.patrol.setMunicipalityOverride.useMutation({
    onSuccess: () => {
      setOverrideTarget(null);
      refreshList();
    },
  });

  // Append new pages to accumulated
  useEffect(() => {
    if (listQuery.data?.items !== undefined) {
      if (cursor === undefined) {
        setAccumulated(listQuery.data.items);
      } else {
        setAccumulated((prev) => [...prev, ...(listQuery.data?.items ?? [])]);
      }
    }
  }, [listQuery.data, cursor]);

  const rows = accumulated;
  const isInitialLoading = listQuery.isLoading && rows.length === 0;
  const hasNextPage = listQuery.data?.nextCursor !== undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="state-filter"
          aria-label="Filter by state"
          value={stateFilter}
          onChange={(e) => { setStateFilter(e.target.value as StateFilter); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All States</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          data-testid="type-filter"
          aria-label="Filter by patrol type"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as TypeFilter); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Types</option>
          <option value="foot">Foot</option>
          <option value="seaborne">Seaborne</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="include-test-toggle"
            checked={includeTest}
            onChange={(e) => { setIncludeTest(e.target.checked); }}
            className="h-4 w-4 rounded border-input"
          />
          Show test patrols
        </label>
        {canManage && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="include-deleted-toggle"
              checked={includeDeleted}
              onChange={(e) => { setIncludeDeleted(e.target.checked); }}
              className="h-4 w-4 rounded border-input"
            />
            Show deleted
          </label>
        )}
      </div>

      {isInitialLoading ? (
        <div
          data-testid="patrols-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No patrols match the current filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Municipality</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>First seen</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.id}
                    data-testid={`patrol-row-${p.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { router.push(tenantHref(tenant, `/patrols/${p.id}`)); }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{p.title ?? "(untitled)"}</span>
                        {p.isTestPatrol && (
                          <Badge
                            variant="secondary"
                            data-testid={`test-badge-${p.id}`}
                          >
                            Test
                          </Badge>
                        )}
                        {p.isDeleted && (
                          <Badge
                            variant="destructive"
                            data-testid={`deleted-badge-${p.id}`}
                          >
                            Deleted
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{p.patrolType}</TableCell>
                    <TableCell className="capitalize">{p.state}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>
                          {p.municipality?.name ?? (
                            <span className="text-muted-foreground">Unattributed</span>
                          )}
                        </span>
                        {p.municipalityManual && (
                          <Badge
                            variant="outline"
                            data-testid={`manual-badge-${p.id}`}
                          >
                            Manual
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.startTime !== null
                        ? new Date(p.startTime).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {p.endTime !== null
                        ? new Date(p.endTime).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {p.firstSeenAt !== null
                        ? new Date(p.firstSeenAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell
                        className="text-right"
                        onClick={(e) => { e.stopPropagation(); }}
                      >
                        <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`override-button-${p.id}`}
                          onClick={() => {
                            setSelectedMuni(p.municipalityId ?? "");
                            setOverrideTarget({
                              id: p.id,
                              title: p.title,
                              current: p.municipalityId,
                              manual: p.municipalityManual,
                            });
                          }}
                        >
                          Override
                        </Button>
                        {p.isDeleted ? (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`restore-button-${p.id}`}
                            disabled={restore.isPending}
                            onClick={() => { restore.mutate({ id: p.id }); }}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            data-testid={`delete-button-${p.id}`}
                            onClick={() => {
                              setDeleteTarget({ id: p.id, title: p.title });
                            }}
                          >
                            Delete
                          </Button>
                        )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => { setCursor(listQuery.data?.nextCursor); }}
                disabled={listQuery.isFetching}
              >
                {listQuery.isFetching ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v && !softDelete.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this patrol?</DialogTitle>
            <DialogDescription>
              {deleteTarget !== null
                ? `"${deleteTarget.title ?? "(untitled)"}" will be hidden from patrol lists, exports, and reports. An admin can restore it later via "Show deleted".`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {softDelete.error && (
            <p className="text-sm text-destructive">{softDelete.error.message}</p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setDeleteTarget(null); }}
              disabled={softDelete.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="confirm-delete-button"
              disabled={softDelete.isPending}
              onClick={() => {
                if (deleteTarget !== null) {
                  softDelete.mutate({ id: deleteTarget.id });
                }
              }}
            >
              {softDelete.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overrideTarget !== null}
        onOpenChange={(v) => {
          if (!v && !setOverride.isPending) {
            setOverrideTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set patrol municipality</DialogTitle>
            <DialogDescription>
              Manually setting the municipality stops automatic attribution
              from overwriting it. &quot;Clear override&quot; re-enables
              automatic attribution.
            </DialogDescription>
          </DialogHeader>
          <select
            data-testid="override-municipality-select"
            aria-label="Select municipality"
            value={selectedMuni}
            onChange={(e) => { setSelectedMuni(e.target.value); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
          >
            <option value="">— Select municipality —</option>
            {muniQuery.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.province ? ` (${m.province})` : ""}
              </option>
            ))}
          </select>
          {setOverride.error && (
            <p className="text-sm text-destructive">{setOverride.error.message}</p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setOverrideTarget(null); }}
              disabled={setOverride.isPending}
            >
              Cancel
            </Button>
            {overrideTarget?.manual === true && (
              <Button
                variant="outline"
                data-testid="clear-override-button"
                disabled={setOverride.isPending}
                onClick={() => {
                  setOverride.mutate({ id: overrideTarget.id, municipalityId: null });
                }}
              >
                Clear override (auto)
              </Button>
            )}
            <Button
              data-testid="save-override-button"
              disabled={selectedMuni === "" || setOverride.isPending}
              onClick={() => {
                if (overrideTarget !== null) {
                  setOverride.mutate({ id: overrideTarget.id, municipalityId: selectedMuni });
                }
              }}
            >
              {setOverride.isPending ? "Saving…" : "Save override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
