import type { Job } from "bullmq";
import type { SyncNeededRescanJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import { platformPrisma } from "@marine-guardian/db";
import { enqueueAreaRederive } from "../queues/area-rederive.queue";
import { enqueuePatrolTrackMaterialize } from "../queues/patrol-track-materialize.queue";

/**
 * Maximum number of drift-flagged patrols drained per rescan job. Bounds the
 * candidate query (and the downstream enqueue fan-out) so a large backlog is
 * worked off across several scheduled passes rather than one unbounded job.
 */
const RESCAN_BATCH_SIZE = 100;

export interface SyncNeededRescanResult {
  scanned: number;
  requeued: number;
}

/**
 * Consumer for the `Patrol.syncNeeded` drift marker (set by syncPatrols when a
 * downstream materialization step fails to enqueue after a successful upsert).
 *
 * Queries the (tenantId, syncNeeded, lastSyncedAt) compound index for flagged,
 * non-deleted patrols (oldest-synced first) and re-enqueues their downstream
 * materialization jobs — area re-derive + patrol-track materialize — per id.
 * This requires no new EarthRanger client work: it re-fires exactly the two
 * enqueues whose failure flagged the row in the first place. Both target queues
 * dedupe by deterministic jobId, so re-enqueueing an already-pending row is a
 * no-op.
 *
 * Returns { scanned, requeued } where `scanned` is the number of candidate rows
 * read and `requeued` is the number successfully re-enqueued (a row that throws
 * during enqueue is logged and skipped, leaving its `syncNeeded` flag set for
 * the next pass).
 */
export async function processSyncNeededRescan(
  job: Job<SyncNeededRescanJobPayload>,
): Promise<SyncNeededRescanResult> {
  validateTenantContext(job.data);

  const { tenantId, userId } = job.data;

  const candidates = await platformPrisma.patrol.findMany({
    where: {
      tenantId,
      syncNeeded: true,
      isDeleted: false,
    },
    select: {
      id: true,
      erPatrolId: true,
      lastSyncedAt: true,
    },
    orderBy: { lastSyncedAt: "asc" },
    take: RESCAN_BATCH_SIZE,
  });

  let requeued = 0;

  for (const candidate of candidates) {
    try {
      await enqueueAreaRederive({
        tenantId,
        userId,
        entity: "patrol",
        id: candidate.id,
      });
      await enqueuePatrolTrackMaterialize({
        tenantId,
        userId,
        patrolId: candidate.id,
      });
      requeued += 1;
    } catch (err) {
      console.error(
        `[sync-needed-rescan] re-enqueue failed for patrol ${candidate.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { scanned: candidates.length, requeued };
}
