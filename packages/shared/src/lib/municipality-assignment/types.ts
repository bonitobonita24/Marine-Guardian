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
  /**
   * Optional uploaded water-jurisdiction polygon (municipal waters as drawn
   * by the LGU, e.g. from a KML/KMZ upload) — when present, takes precedence
   * over the generic 15 km-buffer nearest-fallback used by
   * `assignMunicipalityToPoint`/`assignMunicipalityToPointOrNearest`.
   * Municipalities without an uploaded water polygon simply have this
   * null/undefined and are skipped by the water-containment stage.
   */
  waterGeojson?: unknown;
}

export interface ProtectedZoneForAssignment {
  id: string;
  slug: string;
  name: string;
  boundaryGeojson: unknown;
}
