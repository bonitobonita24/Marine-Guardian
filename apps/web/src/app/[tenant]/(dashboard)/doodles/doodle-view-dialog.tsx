"use client";

// Doodles feature — read-only preview dialog. Fetches trpc.doodle.get for the
// selected row, parses its stored GeoJSON FeatureCollection back into
// DoodleStroke[] (the shape DoodleOverlay renders), and shows it on a
// read-only <Map> (active=false — no drawing, no dragPan disabling). If the
// row has no viewJson (older/edge-case rows), the map fits the strokes'
// bounding box instead of relying on a saved center/zoom.

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Map, useMap } from "@/components/ui/map";
import { DoodleOverlay } from "@/components/map/doodle/DoodleOverlay";
import type { DoodleStroke } from "@/components/map/doodle/useDoodle";
import { trpc } from "@/lib/trpc/client";

interface DoodleViewDialogProps {
  doodleId: string | null;
  onOpenChange: (open: boolean) => void;
}

type StoredGeometry = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties?: { color?: unknown; thickness?: unknown } | null;
    geometry: { type: string; coordinates?: unknown };
  }[];
};

const DEFAULT_COLOR = "#ef4444";
const DEFAULT_THICKNESS = 5;
const DEFAULT_CENTER: [number, number] = [120.9842, 14.5995]; // Manila fallback
const DEFAULT_ZOOM = 8;

/** Reverses DoodleToolbar's strokesToGeometryJson — pulls [lng,lat][] +
 * color/thickness back out of each LineString feature. Defensive against
 * malformed/legacy rows (skips any feature that isn't a valid LineString). */
function geometryJsonToStrokes(geometryJson: unknown): DoodleStroke[] {
  const fc = geometryJson as Partial<StoredGeometry> | null | undefined;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    return [];
  }
  const strokes: DoodleStroke[] = [];
  for (const feature of fc.features) {
    if (feature.geometry.type !== "LineString") continue;
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords)) continue;
    const points: [number, number][] = [];
    for (const pt of coords) {
      if (
        Array.isArray(pt) &&
        typeof pt[0] === "number" &&
        typeof pt[1] === "number"
      ) {
        points.push([pt[0], pt[1]]);
      }
    }
    if (points.length < 2) continue;
    const color =
      typeof feature.properties?.color === "string"
        ? feature.properties.color
        : DEFAULT_COLOR;
    const thickness =
      typeof feature.properties?.thickness === "number"
        ? feature.properties.thickness
        : DEFAULT_THICKNESS;
    strokes.push({ points, color, thickness });
  }
  return strokes;
}

function boundsCenterAndZoom(
  strokes: DoodleStroke[],
): { center: [number, number]; zoom: number } {
  const allPoints = strokes.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of allPoints) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const center: [number, number] = [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2,
  ];
  // Rough span-to-zoom heuristic — good enough for a read-only preview (no
  // precise fitBounds needed here since the map has no interactive purpose
  // beyond visually locating the sketch).
  const span = Math.max(maxLng - minLng, maxLat - minLat, 0.0005);
  const zoom = Math.max(3, Math.min(16, Math.log2(360 / span) - 1));
  return { center, zoom };
}

function ReadOnlyDoodlePreview({ strokes }: { strokes: DoodleStroke[] }) {
  const { isLoaded } = useMap();
  return (
    <>
      {isLoaded && (
        <DoodleOverlay
          active={false}
          color={DEFAULT_COLOR}
          thickness={DEFAULT_THICKNESS}
          strokes={strokes}
          onStrokesChange={() => {
            // Read-only preview — never mutated here.
          }}
        />
      )}
    </>
  );
}

export function DoodleViewDialog({
  doodleId,
  onOpenChange,
}: DoodleViewDialogProps) {
  const getQuery = trpc.doodle.get.useQuery(
    { id: doodleId ?? "" },
    { enabled: doodleId !== null },
  );

  const strokes = useMemo(
    () => geometryJsonToStrokes(getQuery.data?.geometryJson),
    [getQuery.data?.geometryJson],
  );

  const viewport = useMemo(() => {
    const viewJson = getQuery.data?.viewJson as
      | { center?: unknown; zoom?: unknown }
      | null
      | undefined;
    if (
      viewJson &&
      Array.isArray(viewJson.center) &&
      typeof viewJson.center[0] === "number" &&
      typeof viewJson.center[1] === "number" &&
      typeof viewJson.zoom === "number"
    ) {
      return {
        center: [viewJson.center[0], viewJson.center[1]] as [number, number],
        zoom: viewJson.zoom,
      };
    }
    return boundsCenterAndZoom(strokes);
  }, [getQuery.data?.viewJson, strokes]);

  return (
    <Dialog
      open={doodleId !== null}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{getQuery.data?.name ?? "Doodle"}</DialogTitle>
        </DialogHeader>
        <div
          className="h-[60vh] w-full overflow-hidden rounded-md border"
          data-testid="doodle-view-map-container"
        >
          {getQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : getQuery.isError ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              Failed to load this doodle.
            </div>
          ) : (
            <Map
              key={doodleId ?? "empty"}
              center={viewport.center}
              zoom={viewport.zoom}
            >
              <ReadOnlyDoodlePreview strokes={strokes} />
            </Map>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
