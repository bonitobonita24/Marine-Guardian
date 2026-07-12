/**
 * derive-municipal-waters.ts
 *
 * Derive a legally-correct "municipal waters" polygon for each coverage
 * municipality — a NON-OVERLAPPING median-line (equidistance) partition:
 *
 *   water[M] = intersect( buffer(land_M, 15 km), nearestRegion_M )  −  union(all land)
 *
 * where nearestRegion_M = the set of points whose NEAREST municipal coastline
 * is M's (an approximate multi-polygon Voronoi built from densified coastlines).
 *
 * Legal basis: PH municipal waters extend 15 km seaward from the coastline
 * (RA 7160 §131, RA 8550 / RA 10654 "Philippine Fisheries Code"). Where two
 * adjacent/opposite municipalities are <30 km apart their waters are divided by
 * the MEDIAN (equidistance) line — the NAMRIA municipal-water delineation
 * method (RA 8550 IRR). Each water point therefore belongs to exactly ONE
 * municipality: the nearest one. (This REPLACES the earlier "buffer only, sea
 * rings may overlap — imaginary line" approximation; owner reversed it
 * 2026-07-13: "true legal boundaries will always still be the real to follow".)
 *
 * Output: apps/web/src/data/coverage/water/<slug>.water.geojson (FeatureCollection,
 * one MultiPolygon feature, boundaryType "municipal-water-median-line"). These
 * are the source of truth loaded into Municipality.water_geojson by
 * seed-municipalities.ts.
 *
 * Run: packages/db/node_modules/.bin/tsx scripts/derive-municipal-waters.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import buffer from "@turf/buffer";
import union from "@turf/union";
import difference from "@turf/difference";
import intersect from "@turf/intersect";
import voronoi from "@turf/voronoi";
import dissolve from "@turf/dissolve";
import bbox from "@turf/bbox";
import { featureCollection, feature as turfFeature, point as turfPoint } from "@turf/helpers";
import { MUNICIPALITIES } from "../apps/web/src/data/coverage/coverage-areas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COVERAGE = path.join(__dirname, "..", "apps", "web", "src", "data", "coverage");
const WATER_DIR = path.join(COVERAGE, "water");
const WATER_KM = 15;
// Coastline densification step (degrees, ~440 m). Finer = a more precise median
// line at the cost of more Voronoi seeds. 440 m is ample for a 15 km jurisdiction.
const STEP_DEG = 0.004;
// Margin (degrees, ~33 km) added around the seed bbox so Voronoi cells extend
// past every coastline into open sea before being capped by the 15 km buffer.
const VORONOI_MARGIN_DEG = 0.3;

type Poly = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
type AnyFC = GeoJSON.FeatureCollection;

function loadLand(file: string): Poly {
  const fc = JSON.parse(fs.readFileSync(path.join(COVERAGE, file), "utf8")) as AnyFC;
  const f = fc.features[0] as Poly;
  return turfFeature(f.geometry) as Poly;
}

function ringsOf(geom: GeoJSON.Geometry): number[][][] {
  if (geom.type === "Polygon") return geom.coordinates as number[][][];
  if (geom.type === "MultiPolygon") return (geom.coordinates as number[][][][]).flat();
  return [];
}

/** Densify a land polygon's boundary into evenly-spaced [lon,lat] seed points
 *  tagged with the municipality slug (used as Voronoi generators). */
function densifyToSeeds(land: Poly, muni: string, seeds: GeoJSON.Feature[]): void {
  for (const ring of ringsOf(land.geometry)) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[i + 1]!;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / STEP_DEG));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        seeds.push(turfPoint([x1 + dx * t, y1 + dy * t], { muni }));
      }
    }
  }
}

function unionAll(feats: Poly[]): Poly | null {
  if (feats.length === 0) return null;
  let u: Poly = feats[0]!;
  for (let i = 1; i < feats.length; i++) {
    const r = union(featureCollection([u, feats[i]!])) as Poly | null;
    if (r) u = r;
  }
  return u;
}

fs.mkdirSync(WATER_DIR, { recursive: true });

const lands = MUNICIPALITIES.map((m) => ({ entry: m, land: loadLand(m.geojsonFile) }));

// Union of ALL municipality land (subtrahend — keeps water rings over sea only).
const allLand = unionAll(lands.map((l) => l.land))!;

// Densify every coastline into muni-labelled Voronoi seeds.
const seeds: GeoJSON.Feature[] = [];
for (const { entry, land } of lands) densifyToSeeds(land, entry.id, seeds);

// Voronoi over a padded region bbox; cells are index-aligned with `seeds`.
const region = bbox(featureCollection(seeds));
const vbbox: [number, number, number, number] = [
  region[0] - VORONOI_MARGIN_DEG,
  region[1] - VORONOI_MARGIN_DEG,
  region[2] + VORONOI_MARGIN_DEG,
  region[3] + VORONOI_MARGIN_DEG,
];
const vor = voronoi(featureCollection(seeds as never), { bbox: vbbox });
vor.features.forEach((cell, i) => {
  if (cell?.geometry) {
    (cell.properties as Record<string, unknown>) = {
      muni: (seeds[i]!.properties as { muni: string }).muni,
    };
  }
});
const cells = featureCollection(
  vor.features.filter((c) => c?.geometry && c.properties) as never,
);

// Dissolve cells by muni, then union any leftover fragments → one nearest-coast
// region per municipality.
const dissolved = dissolve(cells as never, { propertyName: "muni" });
const fragsByMuni = new Map<string, Poly[]>();
for (const f of dissolved.features) {
  const m = (f.properties as { muni: string }).muni;
  (fragsByMuni.get(m) ?? fragsByMuni.set(m, []).get(m)!).push(f as Poly);
}
const regionByMuni = new Map<string, Poly>();
for (const [m, feats] of fragsByMuni) {
  const u = unionAll(feats);
  if (u) regionByMuni.set(m, u);
}

const summary: Record<string, unknown>[] = [];

for (const { entry, land } of lands) {
  const buffered = buffer(land, WATER_KM, { units: "kilometers" }) as Poly | undefined;
  const reg = regionByMuni.get(entry.id);
  if (!buffered || !reg) {
    summary.push({ slug: entry.id, status: "no-buffer-or-region" });
    continue;
  }
  // Cap the nearest-coast region at the 15 km municipal-waters reach…
  const capped = intersect(featureCollection([buffered, reg])) as Poly | null;
  if (!capped) {
    summary.push({ slug: entry.id, status: "no-water (fully inland)" });
    continue;
  }
  // …and subtract ALL land so the ring covers WATER only.
  const water = difference(featureCollection([capped, allLand])) as Poly | null;
  if (!water) {
    summary.push({ slug: entry.id, status: "no-water (fully inland)" });
    continue;
  }
  const geom =
    water.geometry.type === "MultiPolygon"
      ? water.geometry
      : { type: "MultiPolygon", coordinates: [water.geometry.coordinates] };

  const out = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: entry.name,
          province: entry.province,
          boundaryType: "municipal-water-median-line",
          derivation: `intersect(buffer(${WATER_KM}km), nearest-coast Voronoi region) - union(all land)`,
          note: "Legal municipal waters: 15 km seaward, partitioned by the median (equidistance) line between adjacent municipalities. Non-overlapping (RA 7160 §131 / RA 8550 IRR / NAMRIA).",
          year: 2026,
        },
        geometry: geom,
      },
    ],
  };
  const file = path.join(WATER_DIR, `${entry.id}.water.geojson`);
  fs.writeFileSync(file, JSON.stringify(out) + "\n");
  const b = bbox(water).map((n) => Number(n.toFixed(3)));
  summary.push({ slug: entry.id, status: "ok", bbox: b, kb: Math.round(fs.statSync(file).size / 1024) });
}

console.log(JSON.stringify(summary, null, 2));
const ok = summary.filter((s) => s.status === "ok").length;
console.log(`\nWrote ${ok}/${lands.length} non-overlapping median-line water polygons to apps/web/src/data/coverage/water/`);
