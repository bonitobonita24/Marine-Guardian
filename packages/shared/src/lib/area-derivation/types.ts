// types.ts — internal shape used by area-derivation pure functions.
//
// We use a structural subset of the AreaBoundary model (defined in
// packages/shared/src/schemas/area-boundary.ts) so the derivation
// functions stay decoupled from Prisma client types AND from the full
// AreaBoundary shape (which carries tenancy/audit fields irrelevant
// to pure geo logic).
//
// Callers (5.1b persistence, 5.1c BullMQ processor, 5.1d sync engine,
// 5.1e admin UI) project their AreaBoundary rows down to this shape
// before passing into matchByName / findNearestBoundary / deriveArea.

export type GeometryKind = "Polygon" | "LineString";

export interface AreaBoundaryForDerivation {
  id: string;
  name: string;
  aliases: string[];
  isEnabled: boolean;
  geometryType: GeometryKind;
  // GeoJSON — Polygon: { type, coordinates: [[[lon,lat],...]] }
  //          LineString: { type, coordinates: [[lon,lat],...] }
  geometryGeojson: Record<string, unknown>;
}

export interface LatLon {
  lat: number;
  lon: number;
}
