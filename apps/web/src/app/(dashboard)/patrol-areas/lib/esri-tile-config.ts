// Shared Esri World Imagery tile config used by both the read-only
// area-boundary-map (Preview dialog) and area-boundary-editor (Create/Edit).
// Extracted to satisfy the V31 "no repeated logic ≥2 occurrences" rule.

export const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
