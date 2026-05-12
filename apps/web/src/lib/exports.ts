/**
 * Build a query-string URL for the per-entity export Route Handlers.
 *
 * Used by entity list pages to power the "Export CSV" / "Export PDF" buttons.
 * The Route Handler validates the same `format` + filter parameters server-side
 * — this helper only assembles the URL.
 */
export type ExportFormat = "csv" | "pdf";

export type ExportEntity =
  | "events"
  | "patrols"
  | "alert-rules"
  | "notifications"
  | "alert-history";

export function buildExportUrl(
  entity: ExportEntity,
  filters: Record<string, string | number | undefined | null>,
  format: ExportFormat,
): string {
  const params = new URLSearchParams();
  params.set("format", format);
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return `/api/exports/${entity}?${params.toString()}`;
}
