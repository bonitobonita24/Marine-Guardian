// 5.2b — patrol-track-materialize processor.
//
// BullMQ job handler that delegates to materializePatrolTrack (5.2a). The
// helper itself owns:
//   - patrol + first segment load via Prisma select
//   - tenant credential decryption (earthrangerUrl / earthrangerDasToken /
//     optional earthrangerTrackToken)
//   - EarthRangerClient.fetchSubjectTracks call
//   - feature summary (pointCount + hasTimestamps + lastTrackTime defensive math)
//   - atomic upsert on patrolId unique constraint
//   - skip-on-precondition (no_segment / no_leader / no_credentials)
//
// This processor is intentionally thin — it threads the BullMQ Job<T>
// into the helper's positional args and returns the helper's
// MaterializationResult so BullMQ stores it in the job result (visible in
// the dashboard, useful for the 5.2c admin manual-rebuild UI to surface
// skipReason / pointCount per row).
//
// NO try/catch wrapping — exceptions propagate to BullMQ, which retries
// per the queue-factory default (3 attempts, exponential backoff starting
// at 5000ms). ER 5xx errors and transient network failures benefit from
// retry; 404 / 401 / decrypt failures are programmer/config bugs that
// should surface to the failed-jobs list quickly.
//
// NO AuditLog write — automatic materialization (sync-driven enqueue, when
// later enabled) has no user. Per Option A scope split, 5.2c admin
// manual-rebuild owns AuditLog where ctx.session.userId is available.
//
// NO transaction wrapping — materializePatrolTrack's load+fetch+upsert is
// idempotent; concurrent invocations for the same patrol converge (same
// patrolId unique → last upsert wins, atomic at the row level).

import type { Job } from "bullmq";
import { platformPrisma, type ExtendedPrismaClient } from "@marine-guardian/db";
import type { PatrolTrackMaterializeJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import {
  materializePatrolTrack,
  recomputeDistanceAndDuration,
  type MaterializationResult,
} from "../lib/patrol-track-materialization";
import { enqueueAreaRederive } from "../queues/area-rederive.queue";
import { enqueueMunicipalityAssign } from "../queues/municipality-assign.queue";

/**
 * materializePatrolTrack types its Prisma arg against `ExtendedPrismaClient`
 * (the tenant-guarded, encryption-extended client). The worker process
 * runs outside the request lifecycle and uses `platformPrisma` (the
 * unextended client) by design — the helper passes explicit tenant-scoped
 * queries internally and reads encrypted tenant credentials via the
 * standalone `decrypt()` function (not the extension), so neither the
 * tenant-guard nor the encryption extension is needed at this boundary.
 *
 * The runtime shape of platformPrisma is structurally compatible with
 * ExtendedPrismaClient for every model + method called by the helper
 * (patrol.findFirstOrThrow + .findFirst, tenant.findUniqueOrThrow,
 * patrolTrack.upsert). Cast through `unknown` to satisfy the type contract
 * without a runtime cost — same pattern as 5.1c area-rederive.processor.ts.
 */
const prisma: ExtendedPrismaClient =
  platformPrisma as unknown as ExtendedPrismaClient;

export async function processPatrolTrackMaterialize(
  job: Job<PatrolTrackMaterializeJobPayload>,
): Promise<MaterializationResult> {
  validateTenantContext(job.data);

  const { tenantId, patrolId } = job.data;
  const result = await materializePatrolTrack(prisma, patrolId);
  if (!result.skipped) {
    await recomputeDistanceAndDuration(prisma, patrolId);
  }

  // Geometry fan-out gate (er-sync CPU-spiral fix, follow-up to the event
  // geometryChanged guard) — er-sync.processor.ts no longer enqueues
  // area-rederive / municipality-assign directly for patrols; this
  // processor is now the single trigger, gated on the track actually
  // having changed (result.trackChanged) OR the patrol never having been
  // area-derived yet (areaDerivedAt null — first-ever derive still needs
  // to run even if, degenerately, the track fingerprint didn't move).
  const patrolRow = await prisma.patrol.findUnique({
    where: { id: patrolId },
    select: { areaDerivedAt: true },
  });
  const neverDerived = patrolRow?.areaDerivedAt == null;

  if (result.trackChanged || neverDerived) {
    try {
      await enqueueAreaRederive({
        tenantId,
        userId: "system",
        entity: "patrol",
        id: patrolId,
      });
    } catch (err) {
      console.error(
        `[patrol-track-materialize] enqueueAreaRederive failed for patrol ${patrolId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    try {
      await enqueueMunicipalityAssign({
        tenantId,
        userId: "system",
        entity: "patrol",
        id: patrolId,
      });
    } catch (err) {
      console.error(
        `[patrol-track-materialize] enqueueMunicipalityAssign failed for patrol ${patrolId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return result;
}
