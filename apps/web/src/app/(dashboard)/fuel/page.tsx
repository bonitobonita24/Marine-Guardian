"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  FuelEntryTable,
  type FuelEntryRow,
} from "./fuel-entry-table";
import { CreateFuelEntryDialog } from "./create-fuel-entry-dialog";
import { EditFuelEntryDialog } from "./edit-fuel-entry-dialog";
import { DeleteFuelEntryDialog } from "./delete-fuel-entry-dialog";
import { FuelAnalyticsPanel } from "./fuel-analytics-panel";

/**
 * Fuel Logging page — PRODUCT.md §111-128.
 *
 * Surfaces the bulk fuel allocation lifecycle:
 *   - chronological table with area + date filters
 *   - Log Fuel dialog (operator+) — Create
 *   - row-level Edit (operator on OWN, coordinator+ on any)
 *   - row-level Delete (site_admin+)
 *   - consumption analytics panel (KPIs + trend chart + per-area breakdown)
 *
 * Mirrors the patrol-areas orchestrator pattern — dialogs are siblings
 * driven by single-target state vars, opened from table row callbacks.
 */
export default function FuelPage() {
  const { data: session } = useSession();
  const roles = session?.user.roles ?? [];

  const isAdmin =
    roles.includes("super_admin") ||
    roles.includes("site_admin") ||
    roles.includes("administrator");
  const isCoordinator = isAdmin || roles.includes("field_coordinator");
  const isOperator = isCoordinator || roles.includes("operator");

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<FuelEntryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FuelEntryRow | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Fuel Logging</h1>
        {isOperator && (
          <Button
            data-testid="fuel-log-button"
            onClick={() => {
              setShowCreate(true);
            }}
          >
            Log Fuel
          </Button>
        )}
      </div>

      <FuelAnalyticsPanel />

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Entries</h2>
        <FuelEntryTable
          isAdmin={isAdmin}
          isCoordinator={isCoordinator}
          isOperator={isOperator}
          onEdit={(e) => {
            setEditTarget(e);
          }}
          onDelete={(e) => {
            setDeleteTarget(e);
          }}
        />
      </div>

      {showCreate && (
        <CreateFuelEntryDialog
          open={true}
          onOpenChange={(v) => {
            if (!v) setShowCreate(false);
          }}
          onSuccess={() => {
            setShowCreate(false);
          }}
        />
      )}

      {editTarget !== null && (
        <EditFuelEntryDialog
          entry={editTarget}
          isCoordinator={isCoordinator}
          open={true}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null);
          }}
          onSuccess={() => {
            setEditTarget(null);
          }}
        />
      )}

      {deleteTarget !== null && (
        <DeleteFuelEntryDialog
          entry={deleteTarget}
          open={true}
          onOpenChange={(v) => {
            if (!v) setDeleteTarget(null);
          }}
          onSuccess={() => {
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
