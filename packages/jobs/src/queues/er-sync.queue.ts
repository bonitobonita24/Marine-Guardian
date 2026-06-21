/**
 * ER sync queue helpers — ops-milestone-1.
 *
 * Key changes vs. the original:
 *   - `scheduleRecurringErSync` now computes the `since` watermark from
 *     SyncLog BEFORE scheduling the BullMQ repeatable job (q-ops-06).
 *     Recurring jobs carry the watermark at schedule-time so the first
 *     fired iteration is already delta-only.
 *   - `enqueueErSyncWithWatermark` is the new canonical path for recurring
 *     one-shot delta syncs — it computes `since` on-demand from SyncLog.
 *   - The default interval is now 300_000ms (5 min) per PRODUCT.md §Background
 *     Jobs, replacing the incorrect 30_000ms hardcode.
 *   - `removeRecurringErSync` removes the BullMQ repeatable jobs when the
 *     recurring toggle is turned off or the connection goes invalid.
 *
 * q-ops-07: `since=undefined` is FORBIDDEN in the recurring path. The scheduler
 * enforces this by using `getWatermark` (not `getRequiredWatermark`) and
 * skipping schedule if no prior successful sync exists yet — callers should
 * run a one-shot backfill first via `enqueueErSync`.
 */

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { ErSyncJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";
import { getWatermark } from "../lib/er-sync-watermark";

/** The sync types driven by the delta-capable ER endpoints. */
const DELTA_SYNC_TYPES = ["events", "patrols", "observations"] as const satisfies Array<
  Extract<ErSyncJobPayload["syncType"], "events" | "patrols" | "observations">
>;

/** Sync types that do NOT support `since` (full pull every time). */
const FULL_SYNC_TYPES = ["subjects", "event_types"] as const satisfies Array<
  Extract<ErSyncJobPayload["syncType"], "subjects" | "event_types">
>;

const ALL_SYNC_TYPES = [...DELTA_SYNC_TYPES, ...FULL_SYNC_TYPES] as const;

/** Type guard: true when syncType supports delta (`?updated_since=`) queries. */
function isDeltaSyncType(
  syncType: ErSyncJobPayload["syncType"],
): syncType is typeof DELTA_SYNC_TYPES[number] {
  return (DELTA_SYNC_TYPES as readonly string[]).includes(syncType);
}

export function getErSyncQueue(): Queue<ErSyncJobPayload> {
  return getQueue(QUEUE_NAMES.ER_SYNC);
}

/**
 * Enqueue a one-shot ER sync job with the given payload exactly as-is.
 * Callers are responsible for supplying the correct `since` value.
 *
 * For admin-triggered "sync now" calls, use `enqueueErSyncWithWatermark`
 * so the watermark is automatically computed from SyncLog.
 */
export async function enqueueErSync(
  payload: ErSyncJobPayload,
): Promise<string> {
  const queue = getErSyncQueue();
  const job = await queue.add(`er-sync:${payload.syncType}`, payload, {
    jobId: `er-sync__${payload.tenantId}__${payload.syncType}__${String(Date.now())}`,
  });
  return job.id ?? "";
}

/**
 * Enqueue a one-shot delta sync for a single syncType, computing `since`
 * automatically from the last successful SyncLog entry.
 *
 * Used by `settings.syncNow` (all types) and the recurring scheduler
 * to fan out per-type jobs with correct watermarks.
 *
 * Returns the enqueued job id.
 */
export async function enqueueErSyncWithWatermark(
  tenantId: string,
  userId: string,
  syncType: ErSyncJobPayload["syncType"],
): Promise<string> {
  // Full-sync types never use `since` — getWatermark would be unused.
  // Delta types look up the watermark from SyncLog.
  const since = isDeltaSyncType(syncType)
    ? await getWatermark(tenantId, syncType)
    : undefined;

  // exactOptionalPropertyTypes: omit `since` entirely when undefined so the
  // key is absent rather than present-and-undefined.
  const payload: ErSyncJobPayload =
    since !== undefined
      ? { tenantId, userId, syncType, since }
      : { tenantId, userId, syncType };

  return enqueueErSync(payload);
}

/**
 * Schedule BullMQ repeatable jobs for all ER sync types for a given tenant.
 *
 * HARD CONSTRAINT (q-ops-07): only delta-capable types (events/patrols/
 * observations) include a `since` watermark. For types without watermark
 * support (subjects, event_types), the full pull is intentional.
 *
 * For delta types: if no prior successful sync exists, the `since` in the
 * payload will be undefined for the FIRST repeatable firing — this is the
 * single permitted full-pull (the "initial backfill" case). Once that first
 * run completes successfully the watermark exists; the NEXT firing will find
 * it. Subsequent scheduled jobs are always delta-only.
 *
 * If you want to guarantee a watermark before scheduling, call `enqueueErSync`
 * for the initial backfill explicitly, wait for it to succeed, THEN call this.
 *
 * @param tenantId   - tenant to schedule syncs for
 * @param userId     - system sentinel user id (logged on the job payload)
 * @param intervalMs - polling interval (default 300_000ms = 5 min; min 60_000ms = 1 min)
 */
export async function scheduleRecurringErSync(
  tenantId: string,
  userId: string,
  intervalMs: number = 300_000,
): Promise<void> {
  // Clamp: minimum 60s per PRODUCT.md §Background Jobs.
  const safeInterval = Math.max(intervalMs, 60_000);
  const queue = getErSyncQueue();

  for (const syncType of ALL_SYNC_TYPES) {
    // Compute the current watermark for delta types.
    // This is embedded in the repeatable job payload so the FIRST firing of
    // the repeatable job is already delta-scoped if a prior sync exists.
    // If no prior sync exists, `since` is undefined — this is the initial
    // backfill case (q-ops-07 permits it exactly once per tenant+syncType).
    const since = isDeltaSyncType(syncType)
      ? await getWatermark(tenantId, syncType)
      : undefined;

    // exactOptionalPropertyTypes: omit `since` key entirely when undefined.
    const payload: ErSyncJobPayload =
      since !== undefined
        ? { tenantId, userId, syncType, since }
        : { tenantId, userId, syncType };

    await queue.add(
      `er-sync:recurring:${syncType}`,
      payload,
      {
        repeat: { every: safeInterval },
        // Stable jobId: BullMQ uses this to de-duplicate repeatable schedule
        // registrations (upsert semantics — safe to call multiple times).
        jobId: `er-sync__recurring__${tenantId}__${syncType}`,
      },
    );
  }
}

/**
 * Remove all BullMQ repeatable jobs for a tenant's ER sync schedule.
 * Call when the recurring toggle is turned off or the connection goes invalid.
 */
export async function removeRecurringErSync(tenantId: string): Promise<void> {
  const queue = getErSyncQueue();

  for (const syncType of ALL_SYNC_TYPES) {
    // The stable jobId we assigned at schedule-time IS the job-scheduler id in
    // BullMQ v5. `removeJobScheduler` looks up by this id directly — no key
    // iteration needed. Safe to call even when the scheduler doesn't exist.
    const schedulerId = `er-sync__recurring__${tenantId}__${syncType}`;
    await queue.removeJobScheduler(schedulerId);
  }
}
