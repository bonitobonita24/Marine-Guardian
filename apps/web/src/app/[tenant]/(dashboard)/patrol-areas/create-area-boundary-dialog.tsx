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

type GeometryType = "Polygon" | "LineString";
type Source = "official" | "custom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Validate that a parsed object's `coordinates` field matches the expected
// shape for the given geometryType. Polygon expects [[[lng,lat], ...], ...],
// LineString expects [[lng,lat], ...]. Returns null on success, error string
// on failure. We deliberately validate coordinates only — the server stores
// the full record as Json and the 5.1a derive algorithm reads coordinates.
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

function parseAliases(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function CreateAreaBoundaryDialog({
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [aliasesRaw, setAliasesRaw] = useState("");
  const [source, setSource] = useState<Source>("custom");
  const [geometryType, setGeometryType] = useState<GeometryType | null>(null);
  const [geometryGeojsonRaw, setGeometryGeojsonRaw] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [overrideOfficial, setOverrideOfficial] = useState(false);
  const [arcgisReferenceIdRaw, setArcgisReferenceIdRaw] = useState("");

  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; enqueued: number }
    | { kind: "error"; message: string }
    | null
  >(null);

  const create = trpc.areaBoundary.create.useMutation({
    onSuccess: (data) => {
      setFeedback({ kind: "success", enqueued: data.fanOut.enqueued });
      void utils.areaBoundary.list.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function resetForm() {
    setName("");
    setRegion("");
    setAliasesRaw("");
    setSource("custom");
    setGeometryType(null);
    setGeometryGeojsonRaw("");
    setIsEnabled(true);
    setOverrideOfficial(false);
    setArcgisReferenceIdRaw("");
    setValidationError(null);
    setFeedback(null);
    create.reset();
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  function handleSuccessClose() {
    resetForm();
    onSuccess();
  }

  function handleSubmit() {
    setValidationError(null);
    setFeedback(null);

    if (name.trim() === "") {
      setValidationError("Name is required.");
      return;
    }
    if (region.trim() === "") {
      setValidationError("Region is required.");
      return;
    }
    if (geometryType === null) {
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

    create.mutate({
      name: name.trim(),
      region: region.trim(),
      aliases: parseAliases(aliasesRaw),
      source,
      geometryType,
      geometryGeojson: parsedGeojson as Record<string, unknown>,
      isEnabled,
      overrideOfficial,
      arcgisReferenceId:
        arcgisReferenceIdRaw.trim() === "" ? null : arcgisReferenceIdRaw.trim(),
    });
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
          <DialogTitle>Create area boundary</DialogTitle>
          <DialogDescription>
            Create a new area boundary for this tenant. On save, an
            area-rederive job fans out for every Event, Patrol, and FuelEntry
            in this tenant (50/sec rate limiter).
          </DialogDescription>
        </DialogHeader>

        {feedback?.kind === "success" ? (
          <>
            <p
              data-testid="create-success"
              className="text-sm text-emerald-600 dark:text-emerald-400"
            >
              Created — {feedback.enqueued} rederive job
              {feedback.enqueued === 1 ? "" : "s"} enqueued.
            </p>
            <DialogFooter>
              <Button
                data-testid="create-success-close"
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
                <Label htmlFor="ab-create-name">Name</Label>
                <Input
                  id="ab-create-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ab-create-region">Region</Label>
                <Input
                  id="ab-create-region"
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                  }}
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ab-create-aliases">
                  Aliases (comma-separated)
                </Label>
                <Input
                  id="ab-create-aliases"
                  value={aliasesRaw}
                  onChange={(e) => {
                    setAliasesRaw(e.target.value);
                  }}
                  placeholder="e.g. MPA-North, Northern MPA"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ab-create-source">Source</Label>
                <select
                  id="ab-create-source"
                  data-testid="create-source-select"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value as Source);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="custom">Custom</option>
                  <option value="official">Official</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label>Boundary Geometry</Label>
                <AreaBoundaryEditor
                  mode="create"
                  onGeometryChange={(g, t) => {
                    setGeometryGeojsonRaw(g === null ? "" : JSON.stringify(g));
                    setGeometryType(t);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Draw a Polygon or Line on the map. Use the toolbar (top-left)
                  to start drawing, drag vertices to refine, or remove and
                  redraw.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ab-create-arcgis">
                  ArcGIS reference ID (optional)
                </Label>
                <Input
                  id="ab-create-arcgis"
                  value={arcgisReferenceIdRaw}
                  onChange={(e) => {
                    setArcgisReferenceIdRaw(e.target.value);
                  }}
                  maxLength={200}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="ab-create-enabled">Enabled</Label>
                <Switch
                  id="ab-create-enabled"
                  data-testid="create-enabled-switch"
                  checked={isEnabled}
                  onCheckedChange={(v) => {
                    setIsEnabled(v);
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="ab-create-override">Override official</Label>
                <Switch
                  id="ab-create-override"
                  data-testid="create-override-switch"
                  checked={overrideOfficial}
                  onCheckedChange={(v) => {
                    setOverrideOfficial(v);
                  }}
                />
              </div>

              {validationError !== null && (
                <p
                  data-testid="create-validation-error"
                  className="text-sm text-destructive"
                >
                  {validationError}
                </p>
              )}
              {feedback?.kind === "error" && (
                <p
                  data-testid="create-error"
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
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  create.isPending ||
                  geometryGeojsonRaw === "" ||
                  geometryType === null
                }
              >
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
