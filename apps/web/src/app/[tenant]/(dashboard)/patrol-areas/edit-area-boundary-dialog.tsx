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
import { AreaBoundaryEditor } from "./area-boundary-editor.dynamic";
import type { AreaBoundaryRow } from "./area-boundary-table";

type GeometryType = "Polygon" | "LineString";

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

// Validate that a parsed object's `coordinates` field matches the expected
// shape for the given geometryType. Polygon expects [[[lng,lat], ...], ...],
// LineString expects [[lng,lat], ...]. Returns null on success, error string
// on failure. Mirrors the Create dialog's defense-in-depth check.
function validateGeoJsonShape(
  geojson: unknown,
  geometryType: GeometryType,
): string | null {
  if (geojson === null || typeof geojson !== "object" || Array.isArray(geojson)) {
    return "GeoJSON must be an object.";
  }
  const obj = geojson as Record<string, unknown>;
  const coords = obj.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    return "GeoJSON must have a non-empty `coordinates` array.";
  }
  if (geometryType === "Polygon") {
    for (const ring of coords) {
      if (!Array.isArray(ring) || ring.length === 0) {
        return "Polygon `coordinates` must be an array of rings; each ring an array of [lng,lat] pairs.";
      }
      for (const point of ring) {
        if (
          !Array.isArray(point) ||
          point.length < 2 ||
          typeof point[0] !== "number" ||
          typeof point[1] !== "number"
        ) {
          return "Polygon points must be [lng,lat] number pairs.";
        }
      }
    }
  } else {
    for (const point of coords) {
      if (
        !Array.isArray(point) ||
        point.length < 2 ||
        typeof point[0] !== "number" ||
        typeof point[1] !== "number"
      ) {
        return "LineString `coordinates` must be an array of [lng,lat] number pairs.";
      }
    }
  }
  return null;
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

  // Coerce initial.geometryGeojson (typed as `unknown` on AreaBoundaryRow)
  // to a Record for stringify + state defaults. The DB shape is always an
  // object — the `unknown` is a Prisma Json artifact.
  const initialGeometryObject =
    initial.geometryGeojson !== null &&
    typeof initial.geometryGeojson === "object" &&
    !Array.isArray(initial.geometryGeojson)
      ? (initial.geometryGeojson as Record<string, unknown>)
      : null;

  const initialGeometryRaw =
    initialGeometryObject !== null
      ? JSON.stringify(initialGeometryObject)
      : "";

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
  // Allow null mid-edit: the editor emits (null, null) when the admin
  // removes the shape via the geoman toolbar. initial.geometryType
  // itself is NOT NULL per the Prisma schema.
  const [geometryType, setGeometryType] = useState<GeometryType | null>(
    initial.geometryType,
  );
  const [geometryGeojsonRaw, setGeometryGeojsonRaw] =
    useState(initialGeometryRaw);

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
      geometryGeojson?: Record<string, unknown>;
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

    // Geometry diff — only include geometryGeojson when the raw string
    // differs from the initial serialized form. Validate before sending.
    if (geometryGeojsonRaw !== initialGeometryRaw) {
      if (geometryType === null) {
        // Save button already gates on this — defense-in-depth.
        setValidationError("Draw a boundary geometry before saving.");
        return;
      }
      let parsedGeojson: unknown;
      try {
        parsedGeojson = JSON.parse(geometryGeojsonRaw);
      } catch {
        setValidationError("Geometry GeoJSON is not valid JSON.");
        return;
      }
      const shapeError = validateGeoJsonShape(parsedGeojson, geometryType);
      if (shapeError !== null) {
        setValidationError(shapeError);
        return;
      }
      patch.geometryGeojson = parsedGeojson as Record<string, unknown>;
    }

    if (Object.keys(patch).length === 0) {
      setValidationError("No changes to save.");
      return;
    }

    update.mutate({ id: initial.id, ...patch });
  }

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
            Source is locked after create. Geometry type cannot be changed —
            delete and re-create to change type. Saving fans out an
            area-rederive job for every Event, Patrol, and FuelEntry in this
            tenant.
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

              <div className="space-y-1.5">
                <Label>Source (locked)</Label>
                <Input
                  data-testid="edit-source-locked"
                  value={initial.source}
                  readOnly
                  disabled
                />
              </div>

              <div className="space-y-1">
                <Label>Boundary Geometry</Label>
                <AreaBoundaryEditor
                  mode="edit"
                  initialGeometry={initialGeometryObject}
                  initialType={initial.geometryType}
                  onGeometryChange={(g, t) => {
                    setGeometryGeojsonRaw(g === null ? "" : JSON.stringify(g));
                    setGeometryType(t);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Drag vertices to refine, drag the whole shape to reposition,
                  or use the toolbar (top-left) to remove and redraw. Geometry
                  type cannot be changed on edit — delete and re-create to
                  change type.
                </p>
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
              <Button
                onClick={handleSubmit}
                disabled={
                  update.isPending ||
                  geometryGeojsonRaw === "" ||
                  geometryType === null
                }
              >
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
