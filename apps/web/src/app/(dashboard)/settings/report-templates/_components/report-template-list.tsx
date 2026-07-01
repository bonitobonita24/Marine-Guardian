"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Star, Loader2 } from "lucide-react";
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
import { ReportTemplateForm, type TemplateRecord } from "./report-template-form";

const LAYOUT_LABELS: Record<string, string> = {
  "landscape-one-per-page": "Landscape",
  "portrait-one-per-page": "Portrait",
  continuous: "Continuous",
};

export function ReportTemplateList() {
  const utils = trpc.useUtils();

  // 200 is the schema maximum — sufficient for any realistic number of templates on
  // a settings page; avoids complex pagination state that conflicts with invalidation.
  const listQuery = trpc.reportTemplate.list.useQuery({ limit: 200 });
  const templates = listQuery.data?.items ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TemplateRecord | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const deleteMut = trpc.reportTemplate.delete.useMutation({
    onSuccess: () => {
      void utils.reportTemplate.list.invalidate();
      setDeleteTarget(null);
      setDeleteError(null);
      setActionStatus("Template deleted.");
    },
    onError: (err) => {
      setDeleteError(err.message);
    },
  });

  const setDefaultMut = trpc.reportTemplate.setDefault.useMutation({
    onSuccess: () => {
      void utils.reportTemplate.list.invalidate();
      setActionStatus("Default template updated.");
    },
    onError: (err) => {
      setActionStatus(`Error: ${err.message}`);
    },
  });

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(t: TemplateRecord) {
    setEditTarget(t);
    setFormOpen(true);
  }

  if (listQuery.isLoading) {
    return (
      <div className="rounded-lg border p-8 flex justify-center" aria-live="polite" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading templates…" />
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="rounded-lg border p-5" role="alert">
        <p className="text-sm text-destructive">
          Failed to load templates: {listQuery.error.message}
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
            {templates.length === 0
              ? "No templates yet."
              : `${String(templates.length)} template${templates.length !== 1 ? "s" : ""}`}
          </p>
          <Button
            type="button"
            onClick={openCreate}
            className="min-h-[44px] gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Template
          </Button>
        </div>

        {templates.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <caption className="sr-only">Report templates list</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Layout</TableHead>
                  <TableHead scope="col">Report Title</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {LAYOUT_LABELS[t.layout] ?? t.layout}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {t.reportTitle}
                    </TableCell>
                    <TableCell>
                      {t.isDefault && (
                        <Badge variant="default" className="gap-1">
                          <Star className="h-3 w-3" aria-hidden="true" />
                          Default
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!t.isDefault && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-[44px] text-xs"
                            onClick={() => { setDefaultMut.mutate({ id: t.id }); }}
                            disabled={setDefaultMut.isPending}
                            aria-label={`Set "${t.name}" as default template`}
                          >
                            Set Default
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-[44px]"
                          onClick={() => {
                            openEdit({
                              id: t.id,
                              name: t.name,
                              layout: t.layout,
                              municipalLogoKey: t.municipalLogoKey,
                              partnerLogoKey: t.partnerLogoKey,
                              reportTitle: t.reportTitle,
                              footerNotes: t.footerNotes,
                              isDefault: t.isDefault,
                            });
                          }}
                          aria-label={`Edit template "${t.name}"`}
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
                            setDeleteTarget({ id: t.id, name: t.name });
                          }}
                          aria-label={`Delete template "${t.name}"`}
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
              No report templates yet. Create one to customize how patrol reports are generated.
            </p>
          </div>
        )}
      </div>

      {/* Create / Edit form dialog */}
      <ReportTemplateForm
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editTarget}
        onSuccess={() => { setActionStatus(editTarget ? "Template updated." : "Template created."); }}
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
        <DialogContent aria-describedby="delete-confirm-desc">
          <DialogHeader>
            <DialogTitle>Delete Report Template</DialogTitle>
          </DialogHeader>
          <p id="delete-confirm-desc" className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong className="text-foreground">{deleteTarget?.name}</strong>? This action
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
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
