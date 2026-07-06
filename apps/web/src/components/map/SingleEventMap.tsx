"use client";

import { Map, MapControls, MapMarker, MarkerContent, MarkerTooltip } from "@/components/ui/map";
import { cn } from "@/lib/utils";

/**
 * Zoom level for a single-event focus view — close enough to read the
 * immediate surroundings (coastline, nearby landmarks) without needing to
 * pan, matching the "locate on map" flyTo zoom used elsewhere (InteractiveMap
 * focusLocation).
 */
const SINGLE_EVENT_ZOOM = 13.5;

type SingleEventMapProps = {
  /** Event latitude (MapLibre coordinate convention is [lon, lat] internally). */
  lat: number;
  /** Event longitude. */
  lon: number;
  /** Optional label shown in the marker's hover tooltip (e.g. event title). */
  label?: string;
  /** Optional event category, used only to tint the marker pin. */
  category?: string;
  /** Additional CSS classes for the map container (sizing/layout). */
  className?: string;
};

/**
 * A self-contained, read-only interactive map showing exactly ONE marker at
 * a given event's coordinate. Used by EventDetailModal's split-view layout —
 * unlike InteractiveMap, this component takes no tRPC dependencies and fetches
 * nothing; it just renders the location the caller already has in hand.
 */
export function SingleEventMap({
  lat,
  lon,
  label,
  category,
  className,
}: SingleEventMapProps) {
  const center: [number, number] = [lon, lat];
  const pinColor =
    category === "monitoring" ? "#0ea5e9" : "#f97316"; // sky-500 / orange-500

  return (
    <div
      className={cn(
        "h-full min-h-[320px] w-full overflow-hidden rounded-md border",
        className,
      )}
      data-testid="single-event-map"
    >
      <Map center={center} zoom={SINGLE_EVENT_ZOOM} className="h-full w-full">
        <MapControls showZoom />
        <MapMarker longitude={lon} latitude={lat}>
          <MarkerContent>
            <div
              className="h-4 w-4 rounded-full border-2 border-white shadow-lg"
              style={{ backgroundColor: pinColor }}
            />
          </MarkerContent>
          {label !== undefined && label.length > 0 && (
            <MarkerTooltip>
              <div className="font-medium">{label}</div>
            </MarkerTooltip>
          )}
        </MapMarker>
      </Map>
    </div>
  );
}
