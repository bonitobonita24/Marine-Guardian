#!/usr/bin/env tsx
/**
 * fetch-apo-reef-wdpa.ts
 *
 * Fetches the authoritative Apo Reef Natural Park polygon from the
 * Protected Planet (WDPA) API and writes it to the coverage data directory,
 * replacing the interim 4-corner bounding-rectangle placeholder.
 *
 * Requires a Protected Planet API token — request one at:
 *   https://api.protectedplanet.net/request
 *
 * Usage:
 *   PP_TOKEN=your_token_here pnpm tsx scripts/fetch-apo-reef-wdpa.ts
 *
 * The script will:
 *   1. Call the WDPA v3 API for protected area ID 2340 (Apo Reef Natural Park)
 *   2. Extract the geometry (Polygon or MultiPolygon)
 *   3. Write a valid GeoJSON FeatureCollection to
 *      apps/web/src/data/coverage/apo-reef-natural-park.geojson
 *      preserving provenance properties (source, source_id, license, etc.)
 *   4. Print a vertex count + area summary so you can verify it's a real
 *      coastline polygon and not another bounding rectangle
 *
 * Do NOT hardcode the token — always pass it via PP_TOKEN env var.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

// ── 1. Resolve paths ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../apps/web/src/data/coverage/apo-reef-natural-park.geojson",
);

// ── 2. Read + validate token ────────────────────────────────────────────────

const PP_TOKEN = process.env["PP_TOKEN"];

if (!PP_TOKEN || PP_TOKEN.trim() === "") {
  console.error(
    "ERROR: PP_TOKEN environment variable is not set.\n" +
      "Request a token at https://api.protectedplanet.net/request\n" +
      "Then run:\n" +
      "  PP_TOKEN=your_token_here pnpm tsx scripts/fetch-apo-reef-wdpa.ts",
  );
  process.exit(1);
}

// ── 3. Fetch from WDPA v3 API ───────────────────────────────────────────────

const WDPA_ID = 2340;
const WDPA_URL =
  `https://api.protectedplanet.net/v3/protected_areas/${WDPA_ID}` +
  `?token=${encodeURIComponent(PP_TOKEN)}&with_geometry=true`;

console.log(`[fetch-apo-reef-wdpa] Fetching WDPA ID ${WDPA_ID} from Protected Planet API…`);

function httpsGet(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { timeout: 30_000, headers: { "User-Agent": "Marine-Guardian/1.0 (github: BlueAlliance)" } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out after 30s"));
    });
  });
}

let rawResponse: { statusCode: number; body: string };
try {
  rawResponse = await httpsGet(WDPA_URL);
} catch (err) {
  console.error(`[fetch-apo-reef-wdpa] ERROR: Network request failed — ${(err as Error).message}`);
  process.exit(1);
}

if (rawResponse.statusCode !== 200) {
  console.error(
    `[fetch-apo-reef-wdpa] ERROR: API returned HTTP ${rawResponse.statusCode}\n` +
      `Body (first 500 chars): ${rawResponse.body.slice(0, 500)}`,
  );
  if (rawResponse.statusCode === 401) {
    console.error(
      "  → Token is invalid or expired. Request a new one at:\n" +
        "    https://api.protectedplanet.net/request",
    );
  }
  if (rawResponse.statusCode === 404) {
    console.error(
      `  → Protected area WDPA ID ${WDPA_ID} not found. Verify the ID at:\n` +
        "    https://www.protectedplanet.net/2340",
    );
  }
  process.exit(1);
}

// ── 4. Parse the API response ───────────────────────────────────────────────

let apiData: unknown;
try {
  apiData = JSON.parse(rawResponse.body);
} catch {
  console.error(
    "[fetch-apo-reef-wdpa] ERROR: API response is not valid JSON.\n" +
      `Body (first 500 chars): ${rawResponse.body.slice(0, 500)}`,
  );
  process.exit(1);
}

// WDPA v3 response shape: { protected_area: { ... , geojson: { ... } } }
// See: https://api.protectedplanet.net/documentation
const pa = (apiData as Record<string, unknown>)["protected_area"] as
  | Record<string, unknown>
  | undefined;

if (!pa) {
  console.error(
    '[fetch-apo-reef-wdpa] ERROR: API response missing "protected_area" key.\n' +
      `Got keys: ${Object.keys(apiData as object).join(", ")}`,
  );
  process.exit(1);
}

// The geometry lives in pa.geojson — it may be a Polygon or MultiPolygon
const geometry = pa["geojson"] as
  | { type: string; coordinates: unknown }
  | undefined;

if (!geometry || !geometry.type || !geometry.coordinates) {
  console.error(
    '[fetch-apo-reef-wdpa] ERROR: API response is missing geometry (pa.geojson).\n' +
      "Ensure the token has geometry access and the request includes with_geometry=true.\n" +
      `pa keys: ${Object.keys(pa).join(", ")}`,
  );
  process.exit(1);
}

// ── 5. Count vertices for the summary ──────────────────────────────────────

function countVertices(geom: { type: string; coordinates: unknown }): number {
  if (geom.type === "Polygon") {
    const rings = geom.coordinates as number[][][];
    return rings.reduce((sum, ring) => sum + ring.length, 0);
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates as number[][][][];
    return polys.reduce(
      (sum, poly) => sum + poly.reduce((s, ring) => s + ring.length, 0),
      0,
    );
  }
  return 0;
}

const vertexCount = countVertices(geometry as { type: string; coordinates: unknown });

// ── 6. Build the GeoJSON FeatureCollection ──────────────────────────────────

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const paName = String(pa["name"] ?? "Apo Reef Natural Park");
const wdpaIdConfirmed = Number(pa["wdpa_id"] ?? WDPA_ID);

const feature = {
  type: "Feature",
  properties: {
    name: paName,
    type: "marine-protected-area",
    wdpaId: wdpaIdConfirmed,
    wikidataId: "Q618756",
    source: "Protected Planet (WDPA v3 API)",
    source_id: `WDPA:${wdpaIdConfirmed}`,
    license: "CC BY 4.0 — IUCN and UNEP-WCMC",
    sourceURL: `https://www.protectedplanet.net/${wdpaIdConfirmed}`,
    retrievedAsOf: today,
    country: "Philippines",
    province: "Occidental Mindoro",
    parentMunicipality: "Sablayan",
    interim: false,
    authoritative: true,
    authoritativeNote:
      "Polygon sourced from the WDPA (World Database on Protected Areas) via the " +
      "Protected Planet API v3 (with_geometry=true). This replaces the interim " +
      "4-corner Senate Bill 2393 bounding rectangle that was used while the API " +
      "token was pending.",
  },
  geometry,
};

const featureCollection = {
  type: "FeatureCollection",
  features: [feature],
};

// ── 7. Write to disk ─────────────────────────────────────────────────────────

const json = JSON.stringify(featureCollection, null, 2);

try {
  fs.writeFileSync(OUTPUT_PATH, json, "utf8");
} catch (err) {
  console.error(
    `[fetch-apo-reef-wdpa] ERROR: Failed to write output file — ${(err as Error).message}\n` +
      `Path: ${OUTPUT_PATH}`,
  );
  process.exit(1);
}

// ── 8. Summary ───────────────────────────────────────────────────────────────

console.log(`[fetch-apo-reef-wdpa] SUCCESS`);
console.log(`  PA name          : ${paName}`);
console.log(`  WDPA ID          : ${wdpaIdConfirmed}`);
console.log(`  Geometry type    : ${geometry.type}`);
console.log(`  Total vertices   : ${vertexCount}`);
console.log(`  Retrieved as-of  : ${today}`);
console.log(`  Written to       : ${OUTPUT_PATH}`);
console.log(``);
console.log(`  NEXT STEPS:`);
console.log(`    1. Verify the polygon visually at https://geojson.io`);
console.log(`    2. Run: pnpm typecheck (from apps/web/)`);
console.log(`    3. Commit: git add apps/web/src/data/coverage/apo-reef-natural-park.geojson`);
console.log(`    4. Update coverage-areas.ts → source/license/sourceURL/boundaryYear if needed`);
