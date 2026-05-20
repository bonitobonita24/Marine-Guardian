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
  type MaterializationResult,
} from "../lib/patrol-track-materialization";

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

  const { patrolId } = job.data;
  return materializePatrolTrack(prisma, patrolId);
}
