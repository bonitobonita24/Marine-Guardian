/**
 * municipality-assignment/types.ts
 *
 * Minimal DTOs for point-in-polygon municipality and protected-zone assignment.
 * The processor loads these from DB; the seed populates DB from GeoJSON files.
 */

export interface MunicipalityForAssignment {
  id: string;
  slug: string;
  name: string;
  boundaryGeojson: unknown;
}

export interface ProtectedZoneForAssignment {
  id: string;
  slug: string;
  name: string;
  boundaryGeojson: unknown;
}
