"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc/client";
import type { AreaBoundaryRow } from "./area-boundary-table";

interface Props {
  boundary: AreaBoundaryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function aliasesToString(aliases: string[]): string {
  return aliases.join(", ");
}

function parseAliases(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function EditAreaBoundaryDialog({
  boundary,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const utils = trpc.useUtils();

  // Initialize from the boundary prop. Hold initial alongside current so
  // we can compute the diff and submit only changed fields.
  const initial = boundary;

  const [name, setName] = useState(initial.name);
  const [region, setRegion] = useState(initial.region);
  const [aliasesRaw, setAliasesRaw] = useState(aliasesToString(initial.aliases));
  const [isEnabled, setIsEnabled] = useState(initial.isEnabled);
  const [overrideOfficial, setOverrideOfficial] = useState(
    initial.overrideOfficial,
  );
  const [arcgisReferenceIdRaw, setArcgisReferenceIdRaw] = useState(
    initial.arcgisReferenceId ?? "",
  );

  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; enqueued: number; count: number }
    | { kind: "error"; message: string }
    | null
  >(null);

  const update = trpc.areaBoundary.update.useMutation({
    onSuccess: (data) => {
      setFeedback({
        kind: "success",
        enqueued: data.fanOut.enqueued,
        count: data.result.count,
      });
      void utils.areaBoundary.list.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function handleClose() {
    setValidationError(null);
    setFeedback(null);
    update.reset();
    onOpenChange(false);
  }

  function handleSuccessClose() {
    setValidationError(null);
    setFeedback(null);
    update.reset();
    onSuccess();
  }

  function handleSubmit() {
    setValidationError(null);
    setFeedback(null);

    const trimmedName = name.trim();
    const trimmedRegion = region.trim();
    if (trimmedName === "") {
      setValidationError("Name is required.");
      return;
    }
    if (trimmedRegion === "") {
      setValidationError("Region is required.");
      return;
    }

    const nextAliases = parseAliases(aliasesRaw);
    const nextArcgis =
      arcgisReferenceIdRaw.trim() === "" ? null : arcgisReferenceIdRaw.trim();

    // Compute diff against initial — only send fields that actually changed.
    const patch: {
      name?: string;
      region?: string;
      aliases?: string[];
      isEnabled?: boolean;
      overrideOfficial?: boolean;
      arcgisReferenceId?: string | null;
    } = {};

    if (trimmedName !== initial.name) patch.name = trimmedName;
    if (trimmedRegion !== initial.region) patch.region = trimmedRegion;
    if (!arraysEqual(nextAliases, initial.aliases)) patch.aliases = nextAliases;
    if (isEnabled !== initial.isEnabled) patch.isEnabled = isEnabled;
    if (overrideOfficial !== initial.overrideOfficial) {
      patch.overrideOfficial = overrideOfficial;
    }
    if (nextArcgis !== initial.arcgisReferenceId) {
      patch.arcgisReferenceId = nextArcgis;
    }

    if (Object.keys(patch).length === 0) {
      setValidationError("No changes to save.");
      return;
    }

    update.mutate({ id: initial.id, ...patch });
  }

  const lockedGeojsonDisplay = (() => {
    try {
      return JSON.stringify(initial.geometryGeojson, null, 2);
    } catch {
      return String(initial.geometryGeojson);
    }
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit area boundary</DialogTitle>
          <DialogDescription>
            Source, geometry type, and geometry GeoJSON are locked after
            create. To change geometry, delete this boundary and create a new
            one. Saving fans out an area-rederive job for every Event, Patrol,
            and FuelEntry in this tenant.
          </DialogDescription>
        </DialogHeader>

        {feedback?.kind === "success" ? (
          <>
            <p
              data-testid="edit-success"
              className="text-sm text-emerald-600 dark:text-emerald-400"
            >
              {feedback.count === 0
                ? "No matching boundary was updated (it may have been deleted)."
                : `Updated — ${String(feedback.enqueued)} rederive job${feedback.enqueued === 1 ? "" : "s"} enqueued.`}
            </p>
            <DialogFooter>
              <Button
                data-testid="edit-success-close"
                onClick={handleSuccessClose}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ab-edit-name">Name</Label>
                <Input
                  id="ab-edit-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ab-edit-region">Region</Label>
                <Input
                  id="ab-edit-region"
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                  }}
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ab-edit-aliases">
                  Aliases (comma-separated)
                </Label>
                <Input
                  id="ab-edit-aliases"
                  value={aliasesRaw}
                  onChange={(e) => {
                    setAliasesRaw(e.target.value);
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Source (locked)</Label>
                  <Input
                    data-testid="edit-source-locked"
                    value={initial.source}
                    readOnly
                    disabled
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Geometry type (locked)</Label>
                  <Input
                    data-testid="edit-geometry-type-locked"
                    value={initial.geometryType}
                    readOnly
                    disabled
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Geometry GeoJSON (locked)</Label>
                <textarea
                  data-testid="edit-geojson-locked"
                  value={lockedGeojsonDisplay}
                  readOnly
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ab-edit-arcgis">
                  ArcGIS reference ID (optional)
                </Label>
                <Input
                  id="ab-edit-arcgis"
                  value={arcgisReferenceIdRaw}
                  onChange={(e) => {
                    setArcgisReferenceIdRaw(e.target.value);
                  }}
                  maxLength={200}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="ab-edit-enabled">Enabled</Label>
                <Switch
                  id="ab-edit-enabled"
                  data-testid="edit-enabled-switch"
                  checked={isEnabled}
                  onCheckedChange={(v) => {
                    setIsEnabled(v);
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="ab-edit-override">Override official</Label>
                <Switch
                  id="ab-edit-override"
                  data-testid="edit-override-switch"
                  checked={overrideOfficial}
                  onCheckedChange={(v) => {
                    setOverrideOfficial(v);
                  }}
                />
              </div>

              {validationError !== null && (
                <p
                  data-testid="edit-validation-error"
                  className="text-sm text-destructive"
                >
                  {validationError}
                </p>
              )}
              {feedback?.kind === "error" && (
                <p
                  data-testid="edit-error"
                  className="text-sm text-destructive"
                >
                  {feedback.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={update.isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
