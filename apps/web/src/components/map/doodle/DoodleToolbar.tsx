"use client";

import { useState } from "react";
import type MapLibreGL from "maplibre-gl";
import { Undo2, Trash2, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import type { DoodleStroke } from "./useDoodle";

const COLOR_PRESETS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#ffffff", // white — reads on the dark basemap
] as const;

const THICKNESS_PRESETS = [2, 5, 10] as const;

type DoodleToolbarProps = {
  surface: "command-center" | "report-map";
  map: MapLibreGL.Map | null;
  color: string;
  onColorChange: (color: string) => void;
  thickness: number;
  onThicknessChange: (thickness: number) => void;
  strokes: DoodleStroke[];
  onUndo: () => void;
  onClear: () => void;
  onSaved: () => void;
};

/** Builds the GeoJSON FeatureCollection the backend stores as geometryJson. */
function strokesToGeometryJson(strokes: DoodleStroke[]) {
  return {
    type: "FeatureCollection" as const,
    features: strokes.map((s) => ({
      type: "Feature" as const,
      properties: { color: s.color, thickness: s.thickness },
      geometry: { type: "LineString" as const, coordinates: s.points },
    })),
  };
}

/**
 * Floating toolbar for the Doodle map-annotation feature — shown only while
 * doodle mode is ON. Placed like InteractiveMap's other floating overlays
 * (e.g. topRightSlot) at `absolute right-3 bottom-3 z-20`, above the
 * DoodleOverlay canvas (z-10).
 */
export function DoodleToolbar({
  surface,
  map,
  color,
  onColorChange,
  thickness,
  onThicknessChange,
  strokes,
  onUndo,
  onClear,
  onSaved,
}: DoodleToolbarProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  const createMut = trpc.doodle.create.useMutation({
    onSuccess: () => {
      setSaveDialogOpen(false);
      setName("");
      setSaveError(null);
      setSavedStatus("Doodle saved.");
      onSaved();
    },
    onError: (err) => {
      setSaveError(err.message);
    },
  });

  const handleSave = () => {
    if (name.trim() === "" || !map) return;
    const center = map.getCenter();
    createMut.mutate({
      name: name.trim(),
      surface,
      geometryJson: strokesToGeometryJson(strokes),
      viewJson: { center: [center.lng, center.lat], zoom: map.getZoom() },
    });
  };

  return (
    <>
      {/* Live region for save feedback (matches the app's local-status
          convention — no toast library is used in this codebase). */}
      <div role="status" aria-live="polite" className="sr-only">
        {savedStatus}
      </div>

      <div
        className={cn(
          "absolute right-3 bottom-3 z-20 flex w-56 flex-col gap-2 rounded-md border bg-background/95 p-3 shadow-md backdrop-blur",
        )}
      >
        <p className="text-xs font-medium text-muted-foreground">Doodle</p>

        {/* Color presets + native color input */}
        <div className="flex flex-wrap items-center gap-1.5">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Use color ${preset}`}
              onClick={() => {
                onColorChange(preset);
              }}
              className={cn(
                "size-6 rounded-full border-2 shadow-sm transition-transform",
                color === preset
                  ? "border-foreground scale-110"
                  : "border-white/60",
              )}
              style={{ backgroundColor: preset }}
            >
              {color === preset && (
                <Check className="mx-auto size-3 text-black/70 mix-blend-difference" />
              )}
            </button>
          ))}
          <input
            type="color"
            aria-label="Custom color"
            value={color}
            onChange={(e) => {
              onColorChange(e.target.value);
            }}
            className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
        </div>

        {/* Pen thickness presets */}
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Thickness</Label>
          <div className="flex gap-1">
            {THICKNESS_PRESETS.map((size) => (
              <button
                key={size}
                type="button"
                aria-label={`${String(size)}px pen`}
                aria-pressed={thickness === size}
                onClick={() => {
                  onThicknessChange(size);
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded border transition-colors",
                  thickness === size
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <span
                  className="rounded-full bg-foreground"
                  style={{ width: size, height: size }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1"
            disabled={strokes.length === 0}
            onClick={onUndo}
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1"
            disabled={strokes.length === 0}
            onClick={() => {
              setConfirmClearOpen(true);
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full gap-1.5"
          disabled={strokes.length === 0}
          onClick={() => {
            setSaveError(null);
            setSaveDialogOpen(true);
          }}
        >
          <Save className="size-3.5" aria-hidden="true" />
          Save
        </Button>
      </div>

      {/* Confirm-clear dialog */}
      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all strokes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes every unsaved doodle stroke on this map. This cannot
            be undone.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmClearOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onClear();
                setConfirmClearOpen(false);
              }}
            >
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save doodle</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doodle-name">Name</Label>
            <Input
              id="doodle-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder="e.g. Patrol boundary sketch"
              autoFocus
            />
            {saveError !== null && (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={name.trim() === "" || createMut.isPending}
              onClick={handleSave}
            >
              {createMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
