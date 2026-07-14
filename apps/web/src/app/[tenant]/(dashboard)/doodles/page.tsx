"use client";

// Doodles — map-annotation feature list page. Mirrors exports/page.tsx's
// shape (client-side RBAC gate + shadcn Table + empty state) and reuses the
// SAME "exports" feature/permission check as the Exports page — the doodle
// backend (doodle.ts router) is deliberately gated under the existing
// "exports" RBAC feature key rather than introducing a new one (owner
// instruction). No pagination here (unlike Exports) since doodle.list has no
// cursor param yet — this is a small, local/dev-only feature surface.

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import { DoodleRow } from "./doodle-row";
import { DoodleViewDialog } from "./doodle-view-dialog";

export default function DoodlesPage() {
  const { data: session } = useSession();
  const roles = session?.user.roles ?? [];
  const canViewDoodles =
    roles.includes("tenant_manager") ||
    roles.includes("tenant_superadmin") ||
    roles.includes("field_coordinator") ||
    roles.includes("viewer") ||
    roles.includes("tenant_admin");

  const [viewingId, setViewingId] = useState<string | null>(null);

  const listQuery = trpc.doodle.list.useQuery(undefined, {
    enabled: canViewDoodles,
  });

  if (!canViewDoodles) {
    return (
      <div
        data-testid="doodles-access-denied"
        className="rounded-md border p-8 text-center text-sm text-muted-foreground"
      >
        You do not have permission to view doodles. Field coordinators or
        administrators can manage map annotations.
      </div>
    );
  }

  const rows = listQuery.data ?? [];
  const isInitialLoading = listQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Doodles</h1>
        <p className="text-sm text-muted-foreground">
          Freehand sketches saved from the Command Center or Interactive
          Report Map&apos;s Doodle tool.
        </p>
      </div>

      {isInitialLoading ? (
        <div
          data-testid="doodles-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div
          data-testid="doodles-empty-state"
          className="rounded-md border p-8 text-center text-sm text-muted-foreground"
        >
          No doodles saved yet. Use the Doodle tool on the Command Center or
          Interactive Report Map to sketch and save one.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Drawn on</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <DoodleRow key={row.id} row={row} onView={setViewingId} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DoodleViewDialog
        doodleId={viewingId}
        onOpenChange={(open) => {
          if (!open) setViewingId(null);
        }}
      />
    </div>
  );
}
