"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { FEATURE_REGISTRY } from "@/lib/rbac/feature-registry";
import { RoleMatrixForm, type RoleRecord } from "./role-matrix-form";

export function RoleList() {
  const utils = trpc.useUtils();
  const t = useTranslations("nav");

  const listQuery = trpc.customRole.list.useQuery();
  const roles = listQuery.data?.items ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleRecord | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const deleteMut = trpc.customRole.delete.useMutation({
    onSuccess: () => {
      void utils.customRole.list.invalidate();
      setDeleteTarget(null);
      setDeleteError(null);
      setActionStatus("Role deleted.");
    },
    onError: (err) => {
      setDeleteError(err.message);
    },
  });

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(role: RoleRecord) {
    setEditTarget(role);
    setFormOpen(true);
  }

  function grantedPermissions(role: RoleRecord) {
    return role.permissions.filter((p) => p.view || p.write || p.update || p.delete);
  }

  function featureSummary(role: RoleRecord): string {
    const granted = grantedPermissions(role);
    if (granted.length === 0) return "No features granted";
    const labels = granted.slice(0, 3).map((p) => {
      const feature = FEATURE_REGISTRY.find((f) => f.key === p.featureKey);
      return feature ? t(feature.labelKey) : p.featureKey;
    });
    const more = granted.length - labels.length;
    return more > 0 ? `${labels.join(", ")} +${String(more)} more` : labels.join(", ");
  }

  if (listQuery.isLoading) {
    return (
      <div
        className="rounded-lg border p-8 flex justify-center"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2
          className="h-5 w-5 animate-spin text-muted-foreground"
          aria-label="Loading custom roles…"
        />
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="rounded-lg border p-5" role="alert">
        <p className="text-sm text-destructive">
          Failed to load custom roles: {listQuery.error.message}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Live region for action feedback */}
      <div role="status" aria-live="polite" className="sr-only">
        {actionStatus}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {roles.length === 0
              ? "No custom roles yet."
              : `${String(roles.length)} custom role${roles.length !== 1 ? "s" : ""}`}
          </p>
          <Button type="button" onClick={openCreate} className="min-h-[44px] gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Role
          </Button>
        </div>

        {roles.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <caption className="sr-only">Custom roles list</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Description</TableHead>
                  <TableHead scope="col">Granted Features</TableHead>
                  <TableHead scope="col" className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                      {role.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{grantedPermissions(role).length}</Badge>
                        <span className="truncate max-w-[300px]">{featureSummary(role)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-[44px]"
                          onClick={() => {
                            openEdit(role);
                          }}
                          aria-label={`Edit role "${role.name}"`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-[44px] text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget({ id: role.id, name: role.name });
                          }}
                          aria-label={`Delete role "${role.name}"`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No custom roles yet. Create one to grant a limited, feature-level permission
              set below the Administrator ceiling.
            </p>
          </div>
        )}
      </div>

      {/* Create / Edit matrix form dialog */}
      <RoleMatrixForm
        open={formOpen}
        onOpenChange={setFormOpen}
        role={editTarget}
        onSuccess={() => {
          setActionStatus(editTarget ? "Role updated." : "Role created.");
        }}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent aria-describedby="delete-role-confirm-desc">
          <DialogHeader>
            <DialogTitle>Delete Custom Role</DialogTitle>
          </DialogHeader>
          <p id="delete-role-confirm-desc" className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong className="text-foreground">{deleteTarget?.name}</strong>? Any user
            currently assigned this role will lose its granted permissions. This action
            cannot be undone.
          </p>
          {deleteError !== null && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              disabled={deleteMut.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteTarget !== null) {
                  deleteMut.mutate({ id: deleteTarget.id });
                }
              }}
              disabled={deleteMut.isPending}
              className="min-h-[44px]"
            >
              {deleteMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Delete Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
