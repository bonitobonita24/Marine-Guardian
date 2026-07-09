/**
 * Shared municipality-scope resolver (2026-07-09) — DRY-extracted from
 * reportMap.ts so every report/map surface (reportMap aggregations, map
 * markers, patrol tracks) applies the identical "province rollup" filter
 * semantics: a specific `municipalityId` always wins over `province`; a
 * province-only filter resolves to every municipality in that province
 * (tenant-scoped); neither filter set → no scoping (`undefined`).
 */

import { prisma } from "@marine-guardian/db";

/** The minimal shape every consumer's filter input must satisfy. */
export type MunicipalityScopeFilter = {
  municipalityId?: string | undefined;
  province?: string | undefined;
};

/**
 * Resolves the effective municipality scope for a filter: a specific
 * `municipalityId` always wins over `province` (a targeted selection
 * overrides a province-wide rollup). When only `province` is given, looks up
 * every municipality in that province (tenant-scoped) — an empty result is
 * valid and correctly yields zero matching rows downstream, it is not an
 * error. Returns `undefined` when neither filter is set (no scoping).
 */
export async function resolveMunicipalityScope(
  tenantId: string,
  input: MunicipalityScopeFilter,
): Promise<string[] | undefined> {
  if (input.municipalityId !== undefined) {
    return [input.municipalityId];
  }
  if (input.province !== undefined) {
    const rows = await prisma.municipality.findMany({
      where: { tenantId, province: input.province },
      select: { id: true },
    });
    return rows.map((m) => m.id);
  }
  return undefined;
}

/**
 * A single resolved municipality id collapses to plain equality (matches the
 * shape every other municipalityId-only filter path already produces);
 * multiple ids use an `in` clause.
 */
export function municipalityScopeClause(
  municipalityIds: string[],
): string | { in: string[] } {
  const [first] = municipalityIds;
  return municipalityIds.length === 1 && first !== undefined
    ? first
    : { in: municipalityIds };
}

/**
 * Resolves the child protected-zone ids (MPA/hotspot/custom) whose
 * parentMunicipalityId falls within the given municipality scope. Backs the
 * "Include child boundaries" municipal-report toggle (Phase 4B): it folds
 * events/patrols attributed to a municipality's child zones (via coveredZones)
 * into that municipality's report — typically offshore MPA rows carrying no
 * exclusive municipalityId of their own. An empty result is valid (no children).
 */
export async function resolveChildZoneIds(
  tenantId: string,
  municipalityIds: string[],
): Promise<string[]> {
  if (municipalityIds.length === 0) return [];
  const rows = await prisma.protectedZone.findMany({
    where: { tenantId, parentMunicipalityId: { in: municipalityIds } },
    select: { id: true },
  });
  return rows.map((z) => z.id);
}

/** Shape of the municipality-scope portion of an Event/Patrol where clause. */
export type MunicipalityScopeWhere =
  | { municipalityId: string | { in: string[] } }
  | {
      OR: [
        { municipalityId: string | { in: string[] } },
        { coveredZones: { some: { protectedZoneId: { in: string[] } } } },
      ];
    };

/**
 * Builds the municipality-scope portion of a report where clause. Normally a
 * plain `municipalityId` equality/`in` (matches the existing behaviour). When
 * `childZoneIds` is a NON-EMPTY list ("Include child boundaries" is ON and the
 * scope actually has child zones), it widens to an OR that ALSO matches rows
 * sitting inside one of those child zones (via the coveredZones join) — folding
 * a municipality's MPA/hotspot/custom activity into its report. An empty or
 * undefined `childZoneIds` collapses back to the plain municipality clause
 * (nothing to fold in).
 */
export function buildMunicipalityScopeWhere(
  municipalityIds: string[],
  childZoneIds?: string[],
): MunicipalityScopeWhere {
  const municipalityClause = municipalityScopeClause(municipalityIds);
  if (childZoneIds !== undefined && childZoneIds.length > 0) {
    return {
      OR: [
        { municipalityId: municipalityClause },
        { coveredZones: { some: { protectedZoneId: { in: childZoneIds } } } },
      ],
    };
  }
  return { municipalityId: municipalityClause };
}
