/**
 * extract-adm3-municipalities.mjs
 *
 * One-off sourcing script: extract the 5 municipalities missing from the
 * coverage registry (Mamburao, Santa Cruz, Calintaan — Occidental Mindoro;
 * El Nido, Narra — Palawan) from the geoBoundaries PHL-ADM3 SIMPLIFIED dataset
 * and write them as land-boundary geojson files matching the existing format in
 * apps/web/src/data/coverage/*.geojson.
 *
 * Source: geoBoundaries-PHL-ADM3 (2020), CC BY 3.0 IGO. Pinned commit 9469f09.
 * Input is pre-downloaded to /tmp/phl-adm3s.geojson (simplified, ~6.8MB).
 *
 * Disambiguation: names like "Santa Cruz" repeat across PH — filter by a
 * province bounding box so we grab the Mindoro/Palawan polygon, not another.
 *
 * Run: node scripts/extract-adm3-municipalities.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "apps", "web", "src", "data", "coverage");
const SRC = "/tmp/phl-adm3s.geojson";

const OCC_MINDORO = { lon: [120.0, 121.2], lat: [12.3, 13.6] };
const PALAWAN = { lon: [117.0, 120.5], lat: [8.3, 12.4] };

const TARGETS = [
  { name: "Mamburao",   province: "Occidental Mindoro", slug: "mamburao",   bbox: OCC_MINDORO },
  { name: "Santa Cruz", province: "Occidental Mindoro", slug: "santa-cruz", bbox: OCC_MINDORO },
  { name: "Calintaan",  province: "Occidental Mindoro", slug: "calintaan",  bbox: OCC_MINDORO },
  { name: "El Nido",    province: "Palawan",            slug: "el-nido",    bbox: PALAWAN },
  { name: "Narra",      province: "Palawan",            slug: "narra",      bbox: PALAWAN },
];

function eachCoord(geom, fn) {
  const walk = (a) => {
    if (typeof a[0] === "number") { fn(a); return; }
    for (const x of a) walk(x);
  };
  walk(geom.coordinates);
}

function centroid(geom) {
  let sx = 0, sy = 0, n = 0;
  eachCoord(geom, ([x, y]) => { sx += x; sy += y; n++; });
  return [sx / n, sy / n];
}

function inBbox([lon, lat], b) {
  return lon >= b.lon[0] && lon <= b.lon[1] && lat >= b.lat[0] && lat <= b.lat[1];
}

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const results = [];

for (const t of TARGETS) {
  const candidates = data.features.filter(
    (f) => (f.properties.shapeName || "").trim().toLowerCase() === t.name.toLowerCase(),
  );
  const matched = candidates.filter((f) => inBbox(centroid(f.geometry), t.bbox));

  if (matched.length !== 1) {
    console.error(
      `FAIL ${t.name}: ${candidates.length} name-matches, ${matched.length} in-bbox (need exactly 1)`,
    );
    process.exitCode = 1;
    continue;
  }

  const feat = matched[0];
  const geom =
    feat.geometry.type === "MultiPolygon"
      ? feat.geometry
      : { type: "MultiPolygon", coordinates: [feat.geometry.coordinates] };

  const out = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: t.name,
          province: t.province,
          psgcCode: null,
          geoboundariesShapeID: feat.properties.shapeID,
          source: `geoBoundaries-PHL-ADM3 (shapeID ${feat.properties.shapeID})`,
          license: "CC BY 3.0 IGO",
          sourceURL: "https://github.com/wmgeolab/geoBoundaries",
          boundaryType: "municipality-land",
          year: 2020,
        },
        geometry: geom,
      },
    ],
  };

  const file = path.join(OUT_DIR, `${t.slug}.geojson`);
  fs.writeFileSync(file, JSON.stringify(out) + "\n");
  const [clon, clat] = centroid(geom);
  const bytes = fs.statSync(file).size;
  results.push({
    slug: t.slug,
    name: t.name,
    shapeID: feat.properties.shapeID,
    centroid: [Number(clon.toFixed(4)), Number(clat.toFixed(4))],
    kb: Math.round(bytes / 1024),
  });
}

console.log(JSON.stringify(results, null, 2));
console.log(`\nWrote ${results.length}/5 files to apps/web/src/data/coverage/`);
