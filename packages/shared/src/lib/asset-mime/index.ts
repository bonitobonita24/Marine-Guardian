// Best-effort MIME derivation from a filename extension.
//
// The ER→Telegram asset archiver (Stage 3) does not always persist a
// mime_type on the EventAsset row, so the in-app display (Stage 4) cannot
// rely on it. These helpers recover an effective MIME from the filename so
// the event-detail "Photos" section can decide whether to render an inline
// <img> and the /api/assets/[id] route can set a correct Content-Type.
//
// SVG is intentionally excluded: serving user/ER-supplied SVG with an
// image/svg+xml Content-Type is an XSS vector (security.md). Unknown
// extensions return null so callers fall back to application/octet-stream
// (a safe download, never inline script execution).

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/**
 * Derive a MIME type from a filename's extension, or null when the extension
 * is absent or unrecognised.
 */
export function mimeFromFilename(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

/**
 * True when an asset should render as an inline image. Prefers the stored
 * mimeType; falls back to the filename extension when mimeType is null.
 */
export function isImageAsset(
  mimeType: string | null | undefined,
  filename: string,
): boolean {
  const effective = mimeType ?? mimeFromFilename(filename);
  return effective?.startsWith("image/") ?? false;
}

/**
 * Image MIME types that /api/assets/[id] serves INLINE (inert — no script
 * execution). Mirrors that route's SAFE_INLINE_TYPES image subset; SVG is
 * deliberately absent (image/svg+xml can carry embedded script — security.md).
 * Types outside this set are forced to a download by the route, which an
 * <img> destination cannot render — so thumbnail pickers must gate on THIS
 * set, not on a bare image/* prefix.
 */
export const SAFE_INLINE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/heif",
]);

/**
 * True when an asset will actually render as an inline <img> through the
 * /api/assets/[id] proxy: its effective MIME (stored mimeType, falling back
 * to the filename extension) is in the inline-safe image allowlist.
 */
export function isInlineSafeImageAsset(
  mimeType: string | null | undefined,
  filename: string,
): boolean {
  const effective = mimeType ?? mimeFromFilename(filename);
  return effective !== null && SAFE_INLINE_IMAGE_TYPES.has(effective);
}
