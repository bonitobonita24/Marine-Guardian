/**
 * Shared ReportScope resolver — ONE object describing "what boundary is this
 * report about".
 *
 * Report/map scope is currently re-derived ad hoc at ~8 call sites as a loose
 * pair (`municipalityIds`, `childZoneIds`) plus a stray `input.protectedZoneId`.
 * Every bug in this workstream is a site that received only PART of that pair.
 * This module is the single object all of them share.
 *
 * GOVERNING RULE (owner): "we have a hierarchy of boundaries from Province to
 * Municipality to MPA or other sites. if from Province is selected and the
 * downlines are just set to all, it means that the scope of the report is for
 * Province wide ... but if there are set of downline settings then definitely
 * the focus of the report generation is for that smallest scoped boundary set."
 * => Scope is ALWAYS the smallest boundary EXPLICITLY set. A downline left at
 * "All" means "do not narrow at this level", NOT "ignore this level".
 *
 * BEHAVIOUR-IDENTICAL: this module wraps `municipality-scope.ts` (which keeps
 * working unchanged for any not-yet-migrated caller) and reproduces today's
 * where-clause semantics EXACTLY. It changes no numbers anywhere.
 */

import { prisma } from "@marine-guardian/db";

import {
  buildMunicipalityScopeWhere,
  resolveChildZoneIds,
  resolveMunicipalityScope,
} from "./municipality-scope";
import { bboxOfGeojson } from "./traversing-coverage";

/** The boundary level a report is actually scoped to (smallest explicit set). */
export type ReportScopeLevel = "tenant" | "province" | "municipality" | "zone";

/** The filter input every report/map surface passes in. */
export interface ReportScopeInput {
  municipalityId?: string | undefined;
  province?: string | undefined;
  protectedZoneId?: string | undefined;
  includeChildren?: boolean | undefined;
  includeTraversing?: boolean | undefined;
  includeTraversingFull?: boolean | undefined;
}

export interface ReportScope {
  /** Smallest boundary level explicitly set by the filter. */
  level: ReportScopeLevel;
  /** `undefined` = no municipality narrowing (tenant-wide). */
  municipalityIds: string[] | undefined;
  /** `[]` unless includeChildren is on AND the scope actually has children. */
  childZoneIds: string[];
  /** The explicitly-selected MPA/other zone, when one is set. */
  selectedZoneId: string | undefined;
  /**
   * The zone ids that DEFINE this scope: an explicit zone selection wins over
   * the child-zone rollup (smallest-explicit-boundary rule).
   */
  scopeZoneIds: string[];
  includeTraversing: boolean;
  /**
   * Full-traversing mode (owner, 2026-07-20) — opt-in, ZONE SCOPE ONLY.
   *
   * When true, a patrol that merely ENTERS the selected zone is COUNTED (+1)
   * and contributes its FULL distance and FULL time (including transit that
   * never entered the zone), superseding the inside-portion crediting that
   * `includeTraversing` applies to those same patrols. Rationale: no patrol
   * can ever START inside a small offshore MPA (you cannot reach Apo Reef
   * without departing Sablayan), so an origin-only count reports nearly
   * nothing for such a zone.
   *
   * THIS FIELD IS THE SINGLE ENFORCEMENT POINT for the owner's guardrail that
   * the mode exists at ZONE SCOPE ONLY. A caller passing
   * `includeTraversingFull: true` alongside a municipality-, province- or
   * tenant-level filter gets `false` here.
   *
   * Downstream consumers MUST branch on `scope.includeTraversingFull` alone
   * and MUST NOT re-check the raw input flag or `scope.level` themselves —
   * duplicating the gate is how it drifts out of sync.
   */
  includeTraversingFull: boolean;
  includeChildren: boolean;
}

/**
 * Resolves the full scope object for a report filter.
 *
 * - `municipalityIds` via the existing `resolveMunicipalityScope`
 *   (municipalityId wins over province; province resolves to every
 *   municipality in it; neither → `undefined`).
 * - `childZoneIds` via the existing `resolveChildZoneIds`, ONLY when
 *   `includeChildren === true` AND a municipality scope exists.
 * - `level` is the SMALLEST explicitly-set boundary.
 */
export async function resolveReportScope(
  tenantId: string,
  input: ReportScopeInput,
): Promise<ReportScope> {
  const municipalityIds = await resolveMunicipalityScope(tenantId, input);
  const includeChildren = input.includeChildren === true;
  const includeTraversing = input.includeTraversing === true;

  const childZoneIds =
    includeChildren && municipalityIds !== undefined
      ? await resolveChildZoneIds(tenantId, municipalityIds)
      : [];

  const selectedZoneId = input.protectedZoneId;

  let level: ReportScopeLevel;
  if (selectedZoneId !== undefined) {
    level = "zone";
  } else if (input.municipalityId !== undefined) {
    level = "municipality";
  } else if (input.province !== undefined) {
    level = "province";
  } else {
    level = "tenant";
  }

  // Computed AFTER `level` on purpose — this is the single zone-scope-only
  // gate for the full-traversing mode (see ReportScope.includeTraversingFull).
  const includeTraversingFull =
    input.includeTraversingFull === true && level === "zone";

  return {
    level,
    municipalityIds,
    childZoneIds,
    selectedZoneId,
    scopeZoneIds: selectedZoneId !== undefined ? [selectedZoneId] : childZoneIds,
    includeTraversing,
    includeTraversingFull,
    includeChildren,
  };
}

/** One boundary polygon participating in the scope, ready for clipping/bbox work. */
export interface ScopeGeometryMember {
  id: string;
  kind: "municipality" | "zone";
  landGeojson: unknown;
  waterGeojson: unknown;
  bbox: [number, number, number, number] | null;
}

/**
 * Loads the polygons that DEFINE the scope.
 *
 * IMPORTANT — this returns members for the SMALLEST EXPLICIT scope:
 * - `level === "zone"` → zone members ONLY. The parent municipality is NOT the
 *   scope, and clipping a zone-scoped report's tracks to the parent
 *   municipality polygon is exactly the confirmed scope/clip divergence bug
 *   (disjoint polygons silently delete tracks).
 * - municipality/province level with non-empty `childZoneIds` → municipalities
 *   AND their child zones. De-overlapping those is the CONSUMER's job.
 *
 * NOTE on zone geometry: a `ProtectedZone` row has `boundary_geojson` only and
 * NO water polygon column, so `landGeojson` carries the boundary and
 * `waterGeojson` is `null`. This is CORRECT, not a shortcut — an MPA polygon is
 * already the water polygon; there is no separate land/water split to make.
 */
export async function loadScopeGeometries(
  tenantId: string,
  scope: ReportScope,
): Promise<ScopeGeometryMember[]> {
  const members: ScopeGeometryMember[] = [];

  if (scope.level !== "zone" && scope.municipalityIds !== undefined) {
    const muniRows = await prisma.municipality.findMany({
      where: { tenantId, id: { in: scope.municipalityIds } },
      select: {
        id: true,
        name: true,
        boundaryGeojson: true,
        waterGeojson: true,
      },
    });
    for (const m of muniRows) {
      const bbox =
        bboxOfGeojson(m.waterGeojson ?? m.boundaryGeojson) ??
        bboxOfGeojson(m.boundaryGeojson);
      members.push({
        id: m.id,
        kind: "municipality",
        landGeojson: m.boundaryGeojson,
        waterGeojson: m.waterGeojson,
        bbox,
      });
    }
  }

  if (scope.scopeZoneIds.length > 0) {
    const zoneRows = await prisma.protectedZone.findMany({
      where: { tenantId, id: { in: scope.scopeZoneIds } },
      select: { id: true, name: true, boundaryGeojson: true },
    });
    for (const z of zoneRows) {
      members.push({
        id: z.id,
        kind: "zone",
        landGeojson: z.boundaryGeojson,
        // See NOTE above: ProtectedZone has no water polygon column.
        waterGeojson: null,
        bbox: bboxOfGeojson(z.boundaryGeojson),
      });
    }
  }

  return members;
}

/**
 * The scope portion of an Event/Patrol where clause. Deliberately a flat
 * optional-key object (NOT `Partial<MunicipalityScopeWhere & …>`, which
 * distributes over the union and drops both keys) so it mirrors the inline
 * where-object literal `reportMap.ts` builds today.
 */
export interface ScopeWhere {
  municipalityId?: string | { in: string[] };
  OR?: [
    { municipalityId: string | { in: string[] } },
    { coveredZones: { some: { protectedZoneId: { in: string[] } } } },
  ];
  coveredZones?: { some: { protectedZoneId: string } };
}

/**
 * Builds the scope portion of a report where clause.
 *
 * BEHAVIOUR-PRESERVATION: reproduces `reportMap.ts` `eventWhere`/`patrolWhere`
 * EXACTLY. Today those set the municipality clause (`municipalityId` OR the
 * `OR` widening) and — INDEPENDENTLY, on a DIFFERENT key — the explicit
 * `coveredZones: { some: { protectedZoneId } }`, so the two AND together.
 * That AND is intentional and correct: a zone-scoped report under a
 * municipality means zone AND (muni OR child). Do NOT "simplify" it into a
 * single clause.
 */
export function buildScopeWhere(scope: ReportScope): ScopeWhere {
  const where: ScopeWhere = {};

  if (scope.municipalityIds !== undefined) {
    const municipalityScope = buildMunicipalityScopeWhere(
      scope.municipalityIds,
      scope.childZoneIds,
    );
    if ("OR" in municipalityScope) {
      where.OR = municipalityScope.OR;
    } else {
      where.municipalityId = municipalityScope.municipalityId;
    }
  }

  if (scope.selectedZoneId !== undefined) {
    where.coveredZones = { some: { protectedZoneId: scope.selectedZoneId } };
  }

  return where;
}
