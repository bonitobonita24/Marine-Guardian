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
