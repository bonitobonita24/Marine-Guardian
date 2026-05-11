"use client";

import { Map, MapControls } from "@/components/ui/map";
import { cn } from "@/lib/utils";

// MapLibre coordinate convention is [longitude, latitude] (locked in DECISIONS_LOG).
// Banda Sea center spans Marine Guardian's primary operating area.
const BANDA_SEA_CENTER: [number, number] = [127.5, -2.5];
const DEFAULT_ZOOM = 6;

type InteractiveMapProps = {
  className?: string;
};

export function InteractiveMap({ className }: InteractiveMapProps) {
  return (
    <Map
      center={BANDA_SEA_CENTER}
      zoom={DEFAULT_ZOOM}
      className={cn("h-full w-full", className)}
    >
      <MapControls />
    </Map>
  );
}
