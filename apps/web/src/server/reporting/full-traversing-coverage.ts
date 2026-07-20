/**
 * FULL-traversing patrol coverage — the opt-in zone-scope crediting mode.
 *
 * WHY THIS EXISTS (owner rationale, do not re-derive): for a small offshore
 * MPA no patrol can ever START inside the zone — you cannot reach Apo Reef
 * without leaving from a mainland port such as Sablayan. A zone report that
 * counts only origin-in-zone patrols therefore reports nearly nothing, even
 * though the transit from the port IS part of the patrol effort spent on that
 * zone. So in THIS mode a patrol whose track ENTERS the scope is COUNTED (+1)
 * and contributes its ENTIRE distance and time, including the transit legs
 * that never entered the zone at all.
 *
 * ⚠ SUPERSEDES, NEVER ADDS — the single most important invariant here.
 * This mode SUPERSEDES the clipped inside-portion crediting for exactly the
 * patrols it returns. A traversing patrol contributes EITHER its inside-zone
 * portion (the default clipped mode, `sumTraversingCoverageAcrossMembers` in
 * `./traversing-coverage`) OR its full figures (this module) — NEVER both.
 * Consumers MUST branch between the two; they must never sum them. Adding
 * both is the primary correctness risk of the whole feature.
 *
 * Two independent double-credit guards live in this module:
 *   1. `excludePatrolIds` — patrols already selected by the report's own
 *      where-clause already contribute their full distance/hours to the
 *      headline totals, so they are skipped outright.
 *   2. per-patrol dedupe — a patrol contributes AT MOST ONCE regardless of
 *      how many members it crosses or how many PatrolTrack rows it has.
 *
 * ACCEPTED CONSEQUENCE (owner-acknowledged): with this mode on, the same
 * patrol is counted in full in BOTH its origin municipality's report and the
 * zone's report. The two reports must therefore never be summed, which is why
 * the printable report is stamped when the mode is active.
 *
 * Scope guardrail: this mode is zone-scope-only, but that is enforced ONCE in
 * `resolveReportScope` (`./report-scope`), not here. This module is agnostic —
 * it computes whatever member set it is handed.
 */

import { prisma } from "@marine-guardian/db";
import {
  buildMemberContainment,
  clipTrackAcrossMembers,
  type TraversingMember,
  type TraversingPatrolMeta,
  type TraversingWindow,
} from "./traversing-coverage";

/**
 * One patrol credited in FULL to the scope because its track entered it.
 *
 * Field shapes mirror `TraversingPatrolRow` in
 * `../report-map-report/get-report-map-report-data.ts` so the two row types
 * stay renderable by the same table, with the deliberate difference that
 * `fullKm`/`fullHours` are the WHOLE patrol's figures rather than the clipped
 * `insideKm`/`insideHoursEst`.
 */
export interface FullTraversingPatrolRow {
  patrolId: string;
  title: string | null;
  patrolType: string;
  /** The patrol's own attributed (origin) municipality name — "Unattributed"
   *  when the patrol has no municipality on record. */
  startMunicipalityName: string;
  /** WHOLE patrol distance, including transit outside the scope. */
  fullKm: number;
  /** WHOLE patrol duration in hours, including transit outside the scope. */
  fullHours: number;
}

export interface FullTraversingResult {
  rows: FullTraversingPatrolRow[];
  /** Always === rows.length — one entry per deduped patrol. */
  count: number;
  /** Sum of every row's `fullKm`. */
  km: number;
  /** Sum of every row's `fullHours`. */
  hours: number;
}

const EMPTY_RESULT: FullTraversingResult = { rows: [], count: 0, km: 0, hours: 0 };

/**
 * Collect the patrols that ENTER the given member set within the window and
 * are not already accounted for by the caller, crediting each its FULL
 * distance and time exactly once.
 *
 * @param excludePatrolIds patrol ids already selected by the report's own
 *   where-clause. They already contribute their full figures to the headline
 *   totals; re-adding them here would double-count them.
 */
export async function collectFullTraversingPatrols(
  tenantId: string,
  window: TraversingWindow,
  members: TraversingMember[],
  excludePatrolIds: ReadonlySet<string>,
): Promise<FullTraversingResult> {
  if (members.length === 0) return { ...EMPTY_RESULT, rows: [] };

  const startTime: { gte?: Date; lte?: Date } = {};
  if (window.from !== undefined) startTime.gte = window.from;
  if (window.to !== undefined) startTime.lte = window.to;

  // Same shape/filters as `sumTraversingCoverageAcrossMembers`, plus the
  // identity/labelling fields the rows need.
  const trackRows = await prisma.patrolTrack.findMany({
    where: {
      tenantId,
      patrol: {
        tenantId,
        isDeleted: false,
        isTestPatrol: false,
        ...(startTime.gte !== undefined || startTime.lte !== undefined ? { startTime } : {}),
      },
    },
    select: {
      trackGeojson: true,
      patrol: {
        select: {
          id: true,
          title: true,
          patrolType: true,
          municipalityId: true,
          totalHours: true,
          computedDurationHours: true,
          computedDistanceKm: true,
          totalDistanceKm: true,
          startLocationLat: true,
          startLocationLon: true,
          municipality: { select: { name: true } },
        },
      },
    },
  });

  // Track-independent, so built ONCE for the whole member set — exactly as
  // `sumTraversingCoverageAcrossMembers` does.
  const containment = buildMemberContainment(members);

  // DEDUPE GUARD: keyed by patrolId, so a patrol crossing several members or
  // carrying several PatrolTrack rows contributes its full figures AT MOST
  // ONCE. Never accumulate per member.
  const byPatrolId = new Map<string, FullTraversingPatrolRow>();

  for (const row of trackRows) {
    const patrol = row.patrol;

    // DOUBLE-CREDIT GUARD (cheap path, before any geometry work).
    if (excludePatrolIds.has(patrol.id)) continue;
    if (byPatrolId.has(patrol.id)) continue;

    const patrolMeta: TraversingPatrolMeta = {
      originMunicipalityId: patrol.municipalityId,
      computedDurationHours: patrol.computedDurationHours,
      totalHours: patrol.totalHours,
      computedDistanceKm: patrol.computedDistanceKm,
      totalDistanceKm: patrol.totalDistanceKm,
      startLat: patrol.startLocationLat,
      startLon: patrol.startLocationLon,
    };

    const clip = clipTrackAcrossMembers(row.trackGeojson, members, patrolMeta, containment);

    // ENTRY TEST ONLY. `clip.insideKm` / `clip.insideHoursEst` are the CLIPPED
    // inside-scope portion and are deliberately DISCARDED here — this mode
    // credits the FULL patrol figures instead, never the clipped portion.
    // Reading those two values here is the single most likely mistake.
    if (!clip.traversesNonOrigin) continue;

    // Same coalescing order as the `patrolBreakdown` builder in
    // `get-report-map-report-data.ts`, so both read one source of truth.
    const fullKm = patrol.computedDistanceKm ?? patrol.totalDistanceKm ?? 0;
    const fullHours = patrol.computedDurationHours ?? patrol.totalHours ?? 0;

    byPatrolId.set(patrol.id, {
      patrolId: patrol.id,
      title: patrol.title,
      patrolType: patrol.patrolType,
      startMunicipalityName: patrol.municipality?.name ?? "Unattributed",
      fullKm,
      fullHours,
    });
  }

  const rows = Array.from(byPatrolId.values());
  let km = 0;
  let hours = 0;
  for (const r of rows) {
    km += r.fullKm;
    hours += r.fullHours;
  }

  return { rows, count: rows.length, km, hours };
}
