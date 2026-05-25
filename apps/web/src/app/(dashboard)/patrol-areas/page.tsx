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
import { CreateAreaBoundaryDialog } from "./create-area-boundary-dialog";
import { EditAreaBoundaryDialog } from "./edit-area-boundary-dialog";
import { PreviewAreaBoundaryDialog } from "./preview-area-boundary-dialog";

export default function PatrolAreasPage() {
  const { data: session } = useSession();
  const roles = session?.user.roles ?? [];
  const isAdmin =
    roles.includes("super_admin") || roles.includes("site_admin");

  const [deleteTarget, setDeleteTarget] = useState<AreaBoundaryRow | null>(
    null,
  );
  const [editTarget, setEditTarget] = useState<AreaBoundaryRow | null>(null);
  const [previewTarget, setPreviewTarget] = useState<AreaBoundaryRow | null>(
    null,
  );
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Patrol Areas</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              data-testid="create-area-button"
              onClick={() => {
                setShowCreate(true);
              }}
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
        onEdit={(b) => {
          setEditTarget(b);
        }}
        onPreview={setPreviewTarget}
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

      {editTarget !== null && (
        <EditAreaBoundaryDialog
          boundary={editTarget}
          open={true}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null);
          }}
          onSuccess={() => {
            setEditTarget(null);
          }}
        />
      )}

      {previewTarget && (
        <PreviewAreaBoundaryDialog
          boundary={previewTarget}
          open={true}
          onOpenChange={(open) => {
            if (!open) setPreviewTarget(null);
          }}
        />
      )}

      {showCreate && (
        <CreateAreaBoundaryDialog
          open={true}
          onOpenChange={(v) => {
            if (!v) setShowCreate(false);
          }}
          onSuccess={() => {
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
