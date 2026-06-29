/**
 * Pure helper: classify an official AreaBoundary by its arcgisReferenceId
 * provenance key so the map can style municipality land vs water vs protected
 * zone distinctly without a dedicated schema column.
 *   "official:<slug>:land"  → land
 *   "official:<slug>:water" → water
 *   "official:mpa:<slug>"   → mpa
 */
export type BoundaryKind = "land" | "water" | "mpa";

export function boundaryKindFromRef(ref: string | null): BoundaryKind {
  if (ref != null && ref.startsWith("official:mpa:")) return "mpa";
  if (ref != null && ref.endsWith(":water")) return "water";
  return "land";
}

/**
 * Resolve the source municipality id for a municipality land/water boundary ref
 * ("official:<slug>:land" | "official:<slug>:water") using a slug→id map.
 * Returns undefined for MPA refs ("official:mpa:<slug>") or any ref whose slug
 * is not a known municipality — those boundaries belong to no municipality.
 */
export function municipalityIdFromRef(
  ref: string | null,
  slugToId: Map<string, string>,
): string | undefined {
  if (ref == null) return undefined;
  if (!ref.startsWith("official:") || ref.startsWith("official:mpa:")) {
    return undefined;
  }
  const parts = ref.split(":");
  // "official:<slug>:land" → parts = ["official", "<slug>", "land"]
  if (parts.length !== 3) return undefined;
  const slug = parts[1];
  if (slug === undefined) return undefined;
  return slugToId.get(slug);
}
