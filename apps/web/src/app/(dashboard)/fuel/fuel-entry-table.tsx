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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { useSession } from "next-auth/react";

export interface FuelEntryRow {
  id: string;
  areaName: string;
  areaBoundaryId: string | null;
  dateReceived: Date | string;
  liters: string;
  totalPrice: string;
  currency: string;
  receiptPhotoUrl: string | null;
  notes: string | null;
  loggedByUserId: string;
  loggedBy: { id: string; fullName: string } | null;
  areaBoundary: { id: string; name: string } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface AreaOption {
  id: string;
  name: string;
}

interface Props {
  isAdmin: boolean;
  isCoordinator: boolean;
  isOperator: boolean;
  onEdit: (entry: FuelEntryRow) => void;
  onDelete: (entry: FuelEntryRow) => void;
}

/**
 * Chronological fuel entry list with area filter, date range filter, cursor
 * pagination. Mirrors area-boundary-table shape — same pagination + filter
 * reset pattern, but no debounced text input (areaBoundaryId is a select).
 *
 * Row actions per fuelEntryRouter RBAC (spec §405-408):
 *   Edit : operator+ on OWN entries, OR coordinator+ on any entry
 *   Delete: site_admin+ only
 */
export function FuelEntryTable({
  isAdmin,
  isCoordinator,
  isOperator,
  onEdit,
  onDelete,
}: Props) {
  const { data: session } = useSession();
  const currentUserId = session?.user.id ?? "";

  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [dateFromRaw, setDateFromRaw] = useState<string>("");
  const [dateToRaw, setDateToRaw] = useState<string>("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<FuelEntryRow[]>([]);

  // Reset pagination on any filter change
  useEffect(() => {
    setCursor(undefined);
    setAccumulated([]);
  }, [areaFilter, dateFromRaw, dateToRaw]);

  // Areas dropdown — load active areas once
  const areasQuery = trpc.areaBoundary.list.useQuery({
    limit: 200,
    isEnabled: true,
  });
  const areaOptions = useMemo<AreaOption[]>(() => {
    const items = areasQuery.data?.items ?? [];
    return items.map((a) => ({ id: a.id, name: a.name }));
  }, [areasQuery.data]);

  const queryInput = useMemo(() => {
    const base: {
      limit: number;
      cursor?: string;
      areaBoundaryId?: string;
      dateReceivedFrom?: Date;
      dateReceivedTo?: Date;
    } = { limit: 50 };
    if (cursor !== undefined) base.cursor = cursor;
    if (areaFilter !== "all") base.areaBoundaryId = areaFilter;
    if (dateFromRaw !== "") {
      const d = new Date(dateFromRaw);
      if (!Number.isNaN(d.getTime())) base.dateReceivedFrom = d;
    }
    if (dateToRaw !== "") {
      const d = new Date(dateToRaw);
      if (!Number.isNaN(d.getTime())) base.dateReceivedTo = d;
    }
    return base;
  }, [cursor, areaFilter, dateFromRaw, dateToRaw]);

  const listQuery = trpc.fuelEntry.list.useQuery(queryInput);

  useEffect(() => {
    const data = listQuery.data;
    if (data === undefined) return;
    // Decimal liters/totalPrice are serialized as strings over the wire by
    // tRPC + superjson — Prisma's Decimal class type lies about the runtime
    // shape on the client. Cast via unknown to bridge the type/wire gap.
    const items = data.items as unknown as FuelEntryRow[];
    if (cursor === undefined) {
      setAccumulated(items);
    } else {
      setAccumulated((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const next = items.filter((e) => !existing.has(e.id));
        return [...prev, ...next];
      });
    }
  }, [listQuery.data, cursor]);

  function handleLoadMore() {
    if (listQuery.data?.nextCursor !== undefined) {
      setCursor(listQuery.data.nextCursor);
    }
  }

  function formatDate(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toISOString().slice(0, 10);
  }

  function formatNumber(s: string, fractionDigits: number): string {
    const n = Number(s);
    if (!Number.isFinite(n)) return s;
    return n.toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }

  function canEdit(row: FuelEntryRow): boolean {
    if (isCoordinator) return true;
    if (isOperator && row.loggedByUserId === currentUserId) return true;
    return false;
  }

  const showActions = isOperator || isCoordinator || isAdmin;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Area
          </label>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger
              data-testid="fuel-area-filter"
              className="w-[200px]"
            >
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areaOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <Input
            data-testid="fuel-date-from"
            type="date"
            value={dateFromRaw}
            onChange={(e) => {
              setDateFromRaw(e.target.value);
            }}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <Input
            data-testid="fuel-date-to"
            type="date"
            value={dateToRaw}
            onChange={(e) => {
              setDateToRaw(e.target.value);
            }}
            className="w-[160px]"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Area</TableHead>
              <TableHead className="text-right">Liters</TableHead>
              <TableHead className="text-right">Total Price</TableHead>
              <TableHead>Logged by</TableHead>
              <TableHead>Notes</TableHead>
              {showActions && <TableHead className="w-[120px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading && accumulated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : accumulated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No fuel entries yet.
                </TableCell>
              </TableRow>
            ) : (
              accumulated.map((row) => (
                <TableRow key={row.id} data-testid={`fuel-row-${row.id}`}>
                  <TableCell>{formatDate(row.dateReceived)}</TableCell>
                  <TableCell>
                    {row.areaBoundary?.name ?? row.areaName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.liters, 3)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.currency} {formatNumber(row.totalPrice, 2)}
                  </TableCell>
                  <TableCell>{row.loggedBy?.fullName ?? "—"}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">
                    {row.notes ?? ""}
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex gap-1">
                        {canEdit(row) && (
                          <Button
                            data-testid={`fuel-row-${row.id}-edit`}
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onEdit(row);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            data-testid={`fuel-row-${row.id}-delete`}
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onDelete(row);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {listQuery.data?.nextCursor !== undefined && (
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
    </div>
  );
}
