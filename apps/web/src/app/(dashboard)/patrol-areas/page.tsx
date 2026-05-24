"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { RebuildAreaBoundariesButton } from "./rebuild-button";
import {
  AreaBoundaryTable,
  type AreaBoundaryRow,
} from "./area-boundary-table";
import { DeleteAreaBoundaryDialog } from "./delete-area-boundary-dialog";

export default function PatrolAreasPage() {
  const { data: session } = useSession();
  const roles = session?.user.roles ?? [];
  const isAdmin =
    roles.includes("super_admin") || roles.includes("site_admin");

  const [deleteTarget, setDeleteTarget] = useState<AreaBoundaryRow | null>(
    null,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Patrol Areas</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              data-testid="create-area-stub"
              disabled
              title="Available in A.2"
            >
              Create Area
            </Button>
          )}
          <RebuildAreaBoundariesButton />
        </div>
      </div>

      <AreaBoundaryTable
        isAdmin={isAdmin}
        onDelete={(b) => {
          setDeleteTarget(b);
        }}
      />

      {deleteTarget !== null && (
        <DeleteAreaBoundaryDialog
          boundary={deleteTarget}
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
