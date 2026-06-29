/**
 * derive-municipal-waters.ts
 *
 * Derive an approximate "municipal waters" polygon for each coverage municipality:
 *   waterRing = buffer(landPolygon, 15 km)  MINUS  union(all municipality land)
 *
 * Rationale: PH municipal waters extend ~15 km seaward from the coastline. We
 * approximate that as a 15 km buffer of the land polygon, then subtract ALL land
 * (every municipality's land) so the ring covers WATER only — no inland bulge over
 * neighbours' land. Adjacent municipalities' sea rings may overlap; that is an
 * accepted approximation (owner decision 2026-06-29 — "imaginary line").
 *
 * Output: apps/web/src/data/coverage/water/<slug>.water.geojson (FeatureCollection,
 * one MultiPolygon feature, boundaryType "municipal-water-derived").
 *
 * Run: packages/db/node_modules/.bin/tsx scripts/derive-municipal-waters.ts
 *
 * NOTE: a future authoritative upgrade can replace specific municipalities' water
 * with the real polygon from EarthRanger (e.g. "Calapan - Municipal Water" group).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import buffer from "@turf/buffer";
import union from "@turf/union";
import difference from "@turf/difference";
import { featureCollection, feature as turfFeature } from "@turf/helpers";
import { MUNICIPALITIES } from "../apps/web/src/data/coverage/coverage-areas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COVERAGE = path.join(__dirname, "..", "apps", "web", "src", "data", "coverage");
const WATER_DIR = path.join(COVERAGE, "water");
const WATER_KM = 15;

type Poly = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

function loadLand(slug: string): Poly {
  const fc = JSON.parse(
    fs.readFileSync(path.join(COVERAGE, `${slug}.geojson`), "utf8"),
  ) as GeoJSON.FeatureCollection;
  const f = fc.features[0] as Poly;
  return turfFeature(f.geometry) as Poly;
}

function centroidBbox(geom: GeoJSON.Geometry): { pts: number; bbox: number[] } {
  let pts = 0, minx = 999, miny = 999, maxx = -999, maxy = -999;
  const walk = (a: unknown[]): void => {
    if (typeof a[0] === "number") {
      const [x, y] = a as number[];
      pts++; minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      return;
    }
    for (const x of a) walk(x as unknown[]);
  };
  if ("coordinates" in geom) walk((geom as GeoJSON.Polygon).coordinates as unknown[]);
  return { pts, bbox: [minx, miny, maxx, maxy].map((n) => Number(n.toFixed(3))) };
}

fs.mkdirSync(WATER_DIR, { recursive: true });

const lands = MUNICIPALITIES.map((m) => ({ entry: m, land: loadLand(m.id) }));

// Union of ALL municipality land (subtrahend). Fold pairwise for turf v7.
let allLand: Poly = lands[0]!.land;
for (let i = 1; i < lands.length; i++) {
  const u = union(featureCollection([allLand, lands[i]!.land]));
  if (u) allLand = u as Poly;
}

const summary: Record<string, unknown>[] = [];

for (const { entry, land } of lands) {
  const buffered = buffer(land, WATER_KM, { units: "kilometers" }) as Poly | undefined;
  if (!buffered) {
    summary.push({ slug: entry.id, status: "buffer-failed" });
    continue;
  }
  const water = difference(featureCollection([buffered, allLand])) as Poly | null;
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
          boundaryType: "municipal-water-derived",
          derivation: `buffer(${WATER_KM}km) - union(all municipality land)`,
          note: "Approximate municipal-waters extent. Adjacent sea rings may overlap.",
          year: 2026,
        },
        geometry: geom,
      },
    ],
  };
  const file = path.join(WATER_DIR, `${entry.id}.water.geojson`);
  fs.writeFileSync(file, JSON.stringify(out) + "\n");
  const cb = centroidBbox(geom as GeoJSON.Geometry);
  summary.push({ slug: entry.id, status: "ok", pts: cb.pts, bbox: cb.bbox, kb: Math.round(fs.statSync(file).size / 1024) });
}

console.log(JSON.stringify(summary, null, 2));
const ok = summary.filter((s) => s.status === "ok").length;
console.log(`\nWrote ${ok}/${lands.length} water polygons to apps/web/src/data/coverage/water/`);
