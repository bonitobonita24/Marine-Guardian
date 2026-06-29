/**
 * parse-kml-file.ts — browser-side KML/KMZ → GeoJSON.
 *
 * The MPA-upload dialog parses the file in the browser (native DOMParser +
 * @tmcw/togeojson; JSZip unzips KMZ) and sends the resulting GeoJSON to the
 * `municipality.createMpaFromUpload` mutation, which re-validates server-side.
 * Heavy deps (jszip, togeojson) are dynamically imported so they only load when
 * a user actually opens the dialog and picks a file — never in the main bundle.
 *
 * Client boundary only — the server (mpa-geojson.ts) is the trusted validator.
 */

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB — generous for any real boundary

export class KmlParseError extends Error {}

/** Read a KMZ (zip) ArrayBuffer and return the text of its primary .kml entry. */
async function kmzToKmlText(buffer: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  // Prefer doc.kml; otherwise the first .kml entry found.
  const entries = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith(".kml"));
  if (entries.length === 0) {
    throw new KmlParseError("The KMZ file does not contain a .kml document.");
  }
  const preferred =
    entries.find((n) => n.toLowerCase().endsWith("doc.kml")) ?? entries[0];
  const entry = preferred != null ? zip.files[preferred] : undefined;
  if (!entry) {
    throw new KmlParseError("The KMZ file does not contain a readable .kml document.");
  }
  return entry.async("string");
}

/**
 * Parse a KML or KMZ File into a GeoJSON FeatureCollection.
 * Throws KmlParseError with a human-readable message on any problem.
 */
export async function parseKmlFile(file: File): Promise<unknown> {
  if (file.size > MAX_FILE_BYTES) {
    throw new KmlParseError(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 8 MB).`,
    );
  }

  const lower = file.name.toLowerCase();
  const isKmz = lower.endsWith(".kmz");
  const isKml = lower.endsWith(".kml");
  if (!isKmz && !isKml) {
    throw new KmlParseError("Unsupported file type. Upload a .kml or .kmz file.");
  }

  let kmlText: string;
  try {
    kmlText = isKmz ? await kmzToKmlText(await file.arrayBuffer()) : await file.text();
  } catch (err) {
    if (err instanceof KmlParseError) throw err;
    throw new KmlParseError("The file could not be read.");
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(kmlText, "application/xml");
  } catch {
    throw new KmlParseError("The KML content is not valid XML.");
  }
  if (doc.querySelector("parsererror")) {
    throw new KmlParseError("The KML content is not valid XML.");
  }

  const { kml } = await import("@tmcw/togeojson");
  const geojson = kml(doc) as { type?: string; features?: unknown[] };

  if (
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features) ||
    geojson.features.length === 0
  ) {
    throw new KmlParseError("No map shapes were found in the file.");
  }

  return geojson;
}

/** Count polygon features for a quick client-side preview / early validation. */
export function countPolygonFeatures(geojson: unknown): number {
  const fc = geojson as { features?: { geometry?: { type?: string } }[] };
  if (!Array.isArray(fc.features)) return 0;
  return fc.features.filter((f) => {
    const t = f.geometry?.type;
    return t === "Polygon" || t === "MultiPolygon";
  }).length;
}
