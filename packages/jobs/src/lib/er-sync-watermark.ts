/**
 * EarthRanger sync watermark helper — ops-milestone-1 (q-ops-06/07).
 *
 * Computes the `since` ISO timestamp that must be passed to every RECURRING
 * ER sync job. The watermark is the completedAt of the most recent successful
 * SyncLog entry for the given (tenantId, syncType) pair.
 *
 * HARD RULES (from DECISIONS_LOG 2026-06-21 addendum, q-ops-06/07):
 *   - `since` is ALWAYS returned from this function for a recurring sync path.
 *   - Returns `undefined` ONLY when there has never been a successful sync for
 *     this (tenantId, syncType) pair (i.e., this is the very first run).
 *   - The function MUST NOT be called without a tenantId and syncType.
 *   - Callers that would pass `since=undefined` to a scheduled/recurring job
 *     MUST instead gate the enqueue — a full pull is forbidden in the recurring
 *     path per q-ops-07.
 *
 * Watermark source: SyncLog.completedAt WHERE
 *   tenantId  = tenantId
 *   syncType  = syncType
 *   status    = 'success'
 *   ORDER BY completedAt DESC LIMIT 1
 *
 * The (tenantId, syncType, status, completedAt DESC) composite index in
 * schema.prisma makes this a single-row index scan.
 */

import { platformPrisma } from "@marine-guardian/db";
import type { SyncType } from "@prisma/client";

/**
 * Returns the ISO string watermark for a delta sync, or `undefined` if this
 * is the very first successful sync for this tenant+syncType combination
 * (meaning a full initial backfill is appropriate).
 *
 * For recurring scheduled syncs, callers should use `getRequiredWatermark`
 * instead to enforce the q-ops-07 no-full-pull guarantee.
 */
export async function getWatermark(
  tenantId: string,
  syncType: SyncType,
): Promise<string | undefined> {
  const last = await platformPrisma.syncLog.findFirst({
    where: {
      tenantId,
      syncType,
      status: "success",
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  return last?.completedAt?.toISOString();
}

/**
 * Returns the watermark for a RECURRING sync job. Unlike `getWatermark`,
 * this throws if no prior successful sync exists — callers should check
 * whether the sync has ever run before scheduling recurring jobs
 * (use `hasEverSynced` below).
 *
 * q-ops-07: the recurring path MUST NEVER full-pull (since=undefined).
 * Use this function for recurring job payloads to enforce the constraint
 * at the call site rather than silently sending undefined.
 *
 * @throws Error if no successful sync log exists for this tenant+syncType
 */
export async function getRequiredWatermark(
  tenantId: string,
  syncType: SyncType,
): Promise<string> {
  const watermark = await getWatermark(tenantId, syncType);
  if (watermark === undefined) {
    throw new Error(
      `[er-sync-watermark] No prior successful sync found for tenant ${tenantId} syncType ${syncType}. ` +
        `Run an initial backfill before scheduling recurring syncs (q-ops-07).`,
    );
  }
  return watermark;
}

/**
 * Returns true if a successful sync has ever completed for the given
 * (tenantId, syncType). Used by the recurring scheduler to determine
 * whether it is safe to enqueue a delta sync (i.e., a watermark exists).
 */
export async function hasEverSynced(
  tenantId: string,
  syncType: SyncType,
): Promise<boolean> {
  const count = await platformPrisma.syncLog.count({
    where: {
      tenantId,
      syncType,
      status: "success",
      completedAt: { not: null },
    },
  });
  return count > 0;
}
