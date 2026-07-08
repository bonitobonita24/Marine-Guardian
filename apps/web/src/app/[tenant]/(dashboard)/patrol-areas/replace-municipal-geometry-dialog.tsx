"use client";

// Focused "Replace geometry" dialog for a single official municipal land/water
// boundary row. The target municipality + kind are fixed (passed in as props —
// not selectable here, unlike the general Import Boundary dialog's
// "municipal_boundary" mode). Reuses the same browser-side KML/KMZ parser and
// calls municipality.replaceBoundaryGeometry directly.

import { useRef, useState } from "react";
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
import { trpc } from "@/lib/trpc/client";
import {
  parseKmlFile,
  countPolygonFeatures,
  KmlParseError,
} from "./lib/parse-kml-file";

type BoundaryKind = "land" | "water";

const BOUNDARY_KIND_LABELS: Record<BoundaryKind, string> = {
  land: "Land",
  water: "Water",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  municipalityId: string;
  municipalityName: string;
  kind: BoundaryKind;
  onReplaced?: () => void;
}

export function ReplaceMunicipalGeometryDialog({
  open,
  onOpenChange,
  municipalityId,
  municipalityName,
  kind,
  onReplaced,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<unknown>(null);
  const [polygonCount, setPolygonCount] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ enqueuedJobs: number } | null>(
    null,
  );

  const replaceBoundary = trpc.municipality.replaceBoundaryGeometry.useMutation({
    onSuccess: (data) => {
      setSuccess({ enqueuedJobs: data.enqueuedJobs });
      setError(null);
      onReplaced?.();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function resetState() {
    setFileName(null);
    setGeojson(null);
    setPolygonCount(0);
    setParsing(false);
    setError(null);
    setSuccess(null);
    replaceBoundary.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    onOpenChange(false);
    resetState();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    setGeojson(null);
    setPolygonCount(0);
    if (!file) {
      setFileName(null);
      return;
    }
    setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseKmlFile(file);
      const count = countPolygonFeatures(parsed);
      if (count === 0) {
        setError(
          "No area (polygon) found in that file. A boundary must contain at least one polygon.",
        );
        setGeojson(null);
      } else {
        setGeojson(parsed);
        setPolygonCount(count);
      }
    } catch (err) {
      setError(
        err instanceof KmlParseError ? err.message : "The file could not be read.",
      );
    } finally {
      setParsing(false);
    }
  }

  function handleSubmit() {
    if (geojson == null) return;
    setError(null);
    replaceBoundary.mutate({ municipalityId, kind, geojson });
  }

  const canSubmit = geojson != null && !parsing && !replaceBoundary.isPending;
  const kindLabel = BOUNDARY_KIND_LABELS[kind].toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) onOpenChange(true);
        else handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Replace geometry</DialogTitle>
          <DialogDescription>
            Replacing: {municipalityName} — {BOUNDARY_KIND_LABELS[kind]} boundary
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {municipalityName} {kindLabel} boundary replaced — {success.enqueuedJobs}{" "}
            re-derivation job{success.enqueuedJobs === 1 ? "" : "s"} queued.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="replace-geometry-file">
                Boundary file (.kml or .kmz)
              </Label>
              <Input
                id="replace-geometry-file"
                ref={fileInputRef}
                data-testid="replace-geometry-file-input"
                type="file"
                accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                onChange={(e) => void handleFileChange(e)}
              />
              {parsing && (
                <p className="text-xs text-muted-foreground">Reading file…</p>
              )}
              {!parsing && fileName != null && polygonCount > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {fileName}: {polygonCount} area{polygonCount === 1 ? "" : "s"}{" "}
                  detected.
                </p>
              )}
            </div>

            <p className="text-xs text-destructive" data-testid="replace-geometry-warning">
              This replaces {municipalityName}&apos;s current {kindLabel} boundary
              and triggers a background re-derivation of all events and patrols
              inside it. This cannot be undone — use History to roll back if
              needed.
            </p>

            {error != null && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={replaceBoundary.isPending}
          >
            {success ? "Close" : "Cancel"}
          </Button>
          {!success && (
            <Button
              data-testid="replace-geometry-submit-button"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {replaceBoundary.isPending ? "Replacing…" : "Replace boundary"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
