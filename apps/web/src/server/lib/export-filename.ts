/**
 * Build a deterministic, sortable filename for an export download.
 *
 * Format: `{entity}-{tenantSlug}-{YYYYMMDD-HHmmss}.{format}` (UTC).
 * Example: `events-marine-protect-20260512-143052.csv`.
 *
 * `tenantSlug` is already kebab-case URL-safe per the Tenant.slug constraint,
 * so no further encoding is needed.
 */
export function buildExportFilename(
  entity: string,
  tenantSlug: string,
  format: "csv" | "pdf",
  now: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = String(now.getUTCFullYear());
  const mm = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const HH = pad(now.getUTCHours());
  const MM = pad(now.getUTCMinutes());
  const SS = pad(now.getUTCSeconds());
  const ts = `${yyyy}${mm}${dd}-${HH}${MM}${SS}`;
  return `${entity}-${tenantSlug}-${ts}.${format}`;
}
