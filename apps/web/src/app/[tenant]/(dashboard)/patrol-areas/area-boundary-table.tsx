"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import { ReplaceMunicipalGeometryDialog } from "./replace-municipal-geometry-dialog";
import { BoundaryHistoryDialog } from "./boundary-history-dialog";

type BoundaryKind = "land" | "water";

// Official municipal land/water boundary rows carry an arcgisReferenceId of
// the form "official:{municipalitySlug}:{land|water}" (see
// import-official-boundaries.ts). Only these rows get the Replace
// geometry / History actions — MPAs, special areas, and custom boundaries
// don't have a municipality-scoped geometry to replace or version.
const OFFICIAL_MUNICIPAL_REF = /^official:(.+):(land|water)$/;

interface MunicipalTarget {
  municipalityId: string;
  municipalityName: string;
  kind: BoundaryKind;
}

export interface AreaBoundaryRow {
  id: string;
  name: string;
  aliases: string[];
  region: string;
  source: "official" | "custom";
  geometryType: "Polygon" | "LineString";
  isEnabled: boolean;
  overrideOfficial: boolean;
  arcgisReferenceId: string | null;
  geometryGeojson: unknown;
  createdByUserId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  creator: { id: string; fullName: string } | null;
}

type EnabledFilter = "all" | "enabled" | "disabled";
type SourceFilter = "all" | "official" | "custom";

const ENABLED_OPTIONS: { value: EnabledFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All Sources" },
  { value: "official", label: "Official" },
  { value: "custom", label: "Custom" },
];

interface Props {
  isAdmin: boolean;
  onDelete: (boundary: AreaBoundaryRow) => void;
  onEdit: (boundary: AreaBoundaryRow) => void;
  onPreview: (boundary: AreaBoundaryRow) => void;
}

export function AreaBoundaryTable({
  isAdmin,
  onDelete,
  onEdit,
  onPreview,
}: Props) {
  const [regionInput, setRegionInput] = useState("");
  const [debouncedRegion, setDebouncedRegion] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<AreaBoundaryRow[]>([]);

  const utils = trpc.useUtils();
  const municipalitiesQuery = trpc.municipality.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const municipalityBySlug = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; province: string; slug: string }
    >();
    for (const m of municipalitiesQuery.data ?? []) {
      map.set(m.slug, m);
    }
    return map;
  }, [municipalitiesQuery.data]);

  const [replaceTarget, setReplaceTarget] = useState<MunicipalTarget | null>(
    null,
  );
  const [historyTarget, setHistoryTarget] = useState<MunicipalTarget | null>(
    null,
  );

  function getMunicipalTarget(row: AreaBoundaryRow): MunicipalTarget | null {
    if (row.source !== "official" || row.arcgisReferenceId === null) {
      return null;
    }
    const match = OFFICIAL_MUNICIPAL_REF.exec(row.arcgisReferenceId);
    if (match === null) return null;
    const [, slug, kind] = match;
    const municipality = municipalityBySlug.get(slug ?? "");
    if (municipality === undefined) return null;
    return {
      municipalityId: municipality.id,
      municipalityName: municipality.name,
      kind: kind as BoundaryKind,
    };
  }

  function handleBoundaryMutated() {
    void utils.areaBoundary.list.invalidate();
    void utils.municipality.list.invalidate();
  }

  // Debounce region text input (300ms — matches users page pattern)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedRegion(regionInput);
    }, 300);
    return () => {
      clearTimeout(t);
    };
  }, [regionInput]);

  // Reset pagination on any filter change
  useEffect(() => {
    setCursor(undefined);
    setAccumulated([]);
  }, [debouncedRegion, enabledFilter, sourceFilter]);

  const queryInput = useMemo(() => {
    const base: {
      limit: number;
      cursor?: string;
      region?: string;
      isEnabled?: boolean;
      source?: "official" | "custom";
    } = { limit: 50 };
    if (cursor !== undefined) base.cursor = cursor;
    if (debouncedRegion !== "") base.region = debouncedRegion;
    if (enabledFilter !== "all")
      base.isEnabled = enabledFilter === "enabled";
    if (sourceFilter !== "all") base.source = sourceFilter;
    return base;
  }, [cursor, debouncedRegion, enabledFilter, sourceFilter]);

  const listQuery = trpc.areaBoundary.list.useQuery(queryInput);

  // Merge paginated pages — replace on first page, append on subsequent.
  useEffect(() => {
    const data = listQuery.data;
    if (data === undefined) return;
    const items = data.items as AreaBoundaryRow[];
    if (cursor === undefined) {
      setAccumulated(items);
    } else {
      setAccumulated((prev) => {
        const existing = new Set(prev.map((b) => b.id));
        const next = items.filter((b) => !existing.has(b.id));
        return [...prev, ...next];
      });
    }
  }, [listQuery.data, cursor]);

  function handleLoadMore() {
    if (listQuery.data?.nextCursor !== undefined) {
      setCursor(listQuery.data.nextCursor);
    }
  }

  const rows = accumulated;
  const isInitialLoading = listQuery.isLoading && rows.length === 0;
  const hasNextPage = listQuery.data?.nextCursor !== undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by region"
          value={regionInput}
          onChange={(e) => {
            setRegionInput(e.target.value);
          }}
          className="max-w-xs"
          aria-label="Filter by region"
        />
        <select
          data-testid="enabled-filter"
          aria-label="Filter by enabled status"
          value={enabledFilter}
          onChange={(e) => {
            setEnabledFilter(e.target.value as EnabledFilter);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {ENABLED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          data-testid="source-filter"
          aria-label="Filter by source"
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value as SourceFilter);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isInitialLoading ? (
        <div
          data-testid="area-boundary-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No area boundaries match the current filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Geometry</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Override Official</TableHead>
                  <TableHead>Created By</TableHead>
                  {isAdmin && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => {
                  const municipalTarget = isAdmin ? getMunicipalTarget(b) : null;
                  return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.region}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          b.source === "official" ? "default" : "secondary"
                        }
                      >
                        {b.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.geometryType}
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.isEnabled ? "default" : "outline"}>
                        {b.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          b.overrideOfficial ? "destructive" : "outline"
                        }
                      >
                        {b.overrideOfficial ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.creator?.fullName ?? "—"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            data-testid="row-action-preview"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              onPreview(b);
                            }}
                          >
                            Preview
                          </Button>
                          <Button
                            data-testid="row-action-edit"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              onEdit(b);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            data-testid="row-action-delete"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              onDelete(b);
                            }}
                          >
                            Delete
                          </Button>
                          {municipalTarget !== null && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  data-testid="row-action-more"
                                  variant="outline"
                                  size="sm"
                                >
                                  More
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  data-testid="row-action-replace-geometry"
                                  onClick={() => {
                                    setReplaceTarget(municipalTarget);
                                  }}
                                >
                                  Replace geometry
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  data-testid="row-action-history"
                                  onClick={() => {
                                    setHistoryTarget(municipalTarget);
                                  }}
                                >
                                  History
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={listQuery.isFetching}
              >
                {listQuery.isFetching ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {replaceTarget !== null && (
        <ReplaceMunicipalGeometryDialog
          open
          onOpenChange={(o) => {
            if (!o) setReplaceTarget(null);
          }}
          municipalityId={replaceTarget.municipalityId}
          municipalityName={replaceTarget.municipalityName}
          kind={replaceTarget.kind}
          onReplaced={handleBoundaryMutated}
        />
      )}

      {historyTarget !== null && (
        <BoundaryHistoryDialog
          open
          onOpenChange={(o) => {
            if (!o) setHistoryTarget(null);
          }}
          municipalityId={historyTarget.municipalityId}
          municipalityName={historyTarget.municipalityName}
          kind={historyTarget.kind}
          onReverted={handleBoundaryMutated}
        />
      )}
    </div>
  );
}
