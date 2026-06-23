/**
 * coverage-areas.ts
 *
 * SINGLE SOURCE OF TRUTH for all coverage areas used by Marine Guardian.
 * To add a new municipality or protected zone, add ONE entry here and follow
 * the steps in docs/superpowers/plans/2026-06-23-municipality-coverage-stats.md
 * § "How to add a new coverage area".
 *
 * POLYGON FILES live next to this file in apps/web/src/data/coverage/*.geojson.
 * SOURCE: geoBoundaries-PHL-ADM3 (2020), CC BY 3.0 IGO — NAMRIA/PSA/OCHA.
 * APO REEF: OpenStreetMap way 181365709 (ODbL 1.0), Senate Bill 2393 boundary.
 *
 * SIMPLIFIED (2026-06-23): municipality polygons reduced with mapshaper
 * (Visvalingam 3%, keep-shapes, clean, ~1e-4° ≈ 11 m precision) to keep the
 * repo lean — coarse geometry is sufficient for point-in-polygon assignment
 * per the plan doc. Apo Reef is kept at source resolution (already a 5-vertex
 * legislated rectangle). Re-fetch from the cited sources if a higher-precision
 * boundary is ever required.
 */

export type CoverageAreaType = "municipality" | "protected-zone";

export interface CoverageAreaEntry {
  /** Internal unique key — used as DB lookup / seed identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Province for display & grouping. */
  province: string;
  /** Philippine Standard Geographic Code (PSGC). Null for MPAs. */
  psgcCode: string | null;
  /** "municipality" or "protected-zone" */
  type: CoverageAreaType;
  /** Filename under apps/web/src/data/coverage/ — imported at seed/build time. */
  geojsonFile: string;
  /**
   * For protected zones: the municipality whose waters contain this zone.
   * Null for municipalities themselves.
   */
  parentMunicipalityId: string | null;
  /** Data source for audit trail. */
  source: string;
  /** License string. */
  license: string;
  /** Source URL for provenance. */
  sourceURL: string;
  /** Year of boundary data. */
  boundaryYear: number;
}

/**
 * MUNICIPALITIES — Land polygon ∪ derived 15 km municipal-water polygon.
 * Water derivation is a one-time script step; see the plan doc.
 * Order: Oriental Mindoro → Occidental Mindoro → Palawan
 */
export const MUNICIPALITIES: CoverageAreaEntry[] = [
  // ── Oriental Mindoro ──────────────────────────────────────────────────────
  {
    id: "calapan-city",
    name: "Calapan City",
    province: "Oriental Mindoro",
    psgcCode: "175104000",
    type: "municipality",
    geojsonFile: "calapan-city.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B77350797414463)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "baco",
    name: "Baco",
    province: "Oriental Mindoro",
    psgcCode: "175101000",
    type: "municipality",
    geojsonFile: "baco.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B69479050195003)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "san-teodoro",
    name: "San Teodoro",
    province: "Oriental Mindoro",
    psgcCode: "175110000",
    type: "municipality",
    geojsonFile: "san-teodoro.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B90204819305655)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "puerto-galera",
    name: "Puerto Galera",
    province: "Oriental Mindoro",
    psgcCode: "175109000",
    type: "municipality",
    geojsonFile: "puerto-galera.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B54215534625427)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  // ── Occidental Mindoro ────────────────────────────────────────────────────
  {
    id: "abra-de-ilog",
    name: "Abra de Ilog",
    province: "Occidental Mindoro",
    psgcCode: "174901000",
    type: "municipality",
    geojsonFile: "abra-de-ilog.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B36470920271092)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "sablayan",
    name: "Sablayan",
    province: "Occidental Mindoro",
    psgcCode: "174909000",
    type: "municipality",
    geojsonFile: "sablayan.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B34022252316389)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  // ── Palawan ───────────────────────────────────────────────────────────────
  {
    id: "roxas-palawan",
    name: "Roxas",
    province: "Palawan",
    psgcCode: "175319000",
    type: "municipality",
    // Disambiguated spatially: centroid ~10.07°N, 119.23°E (Palawan)
    // NOT the Roxas in Oriental Mindoro (centroid ~12.59°N, 121.51°E)
    geojsonFile: "roxas-palawan.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B10061841294265)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "araceli",
    name: "Araceli",
    province: "Palawan",
    psgcCode: "175302000",
    type: "municipality",
    geojsonFile: "araceli.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B86342486803813)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "dumaran",
    name: "Dumaran",
    province: "Palawan",
    psgcCode: "175306000",
    type: "municipality",
    geojsonFile: "dumaran.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B96628789522948)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "taytay",
    name: "Taytay",
    province: "Palawan",
    psgcCode: "175322000",
    type: "municipality",
    // Disambiguated spatially: centroid ~10.68°N, 119.60°E (Palawan)
    // NOT the Taytay in Rizal province (centroid ~14.55°N, 121.13°E)
    geojsonFile: "taytay.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B72316190206283)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
  {
    id: "aborlan",
    name: "Aborlan",
    province: "Palawan",
    psgcCode: "175301000",
    type: "municipality",
    geojsonFile: "aborlan.geojson",
    parentMunicipalityId: null,
    source: "geoBoundaries-PHL-ADM3 (shapeID 30758251B88743888905923)",
    license: "CC BY 3.0 IGO",
    sourceURL: "https://github.com/wmgeolab/geoBoundaries",
    boundaryYear: 2020,
  },
];

/**
 * PROTECTED ZONES — Additive overlay layer (many-to-many with Patrol/Event).
 * A patrol/event can count under its municipality AND be flagged for a zone.
 */
export const PROTECTED_ZONES: CoverageAreaEntry[] = [
  {
    id: "apo-reef-natural-park",
    name: "Apo Reef Natural Park",
    province: "Occidental Mindoro",
    psgcCode: null,
    type: "protected-zone",
    geojsonFile: "apo-reef-natural-park.geojson",
    parentMunicipalityId: "sablayan", // nested inside Sablayan waters
    // NOTE: OSM way 181365709 is a 5-point bounding-box polygon per Senate
    // Bill 2393. It covers lon 120.40°–120.56°, lat 12.60°–12.75°. This is
    // the legislated boundary extent, not a detailed coastline polygon. A
    // more detailed coastline polygon from DENR/PAWB may be substituted when
    // available. See plan doc § "Apo Reef boundary notes".
    source: "OpenStreetMap way 181365709 (boundary=national_park, note: Senate Bill 2393 official boundaries)",
    license: "ODbL 1.0",
    sourceURL: "https://www.openstreetmap.org/way/181365709",
    boundaryYear: 2023, // OSM last edited
  },
];

/** All areas in one flat array for convenience. */
export const ALL_COVERAGE_AREAS: CoverageAreaEntry[] = [
  ...MUNICIPALITIES,
  ...PROTECTED_ZONES,
];
