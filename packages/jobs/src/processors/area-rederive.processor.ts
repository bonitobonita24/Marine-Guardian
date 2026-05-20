// 5.1c — area-rederive processor.
//
// BullMQ job handler that delegates to applyAreaDerivation (5.1b). The
// helper itself owns:
//   - per-entity row load with minimal select
//   - tenant-scoped boundary load
//   - pure deriveArea call (5.1a)
//   - per-entity write back (areaBoundaryId + optional areaDerivedAt)
//
// This processor is intentionally thin — it threads the BullMQ Job<T>
// into the helper's positional args and returns the helper's result so
// BullMQ stores it in the job result (visible in the dashboard, useful
// for the 5.1e admin manual-rebuild UI to surface matchedVia per row).
//
// NO try/catch wrapping — exceptions propagate to BullMQ, which retries
// per the queue-factory default (3 attempts, exponential backoff starting
// at 5000ms). findUniqueOrThrow on an invalid id is a programmer bug, not
// a transient failure; the 3-attempt default lets it surface to the
// failed-jobs list quickly.
//
// NO AuditLog write — automatic-derivation contexts (sync engine, worker)
// have no user. Per Option A scope split, 5.1e admin manual-rebuild owns
// AuditLog where ctx.session.userId is available.
//
// NO transaction wrapping — applyAreaDerivation's load+write is idempotent;
// concurrent invocations for the same row converge (same input + same
// boundary set → same output, last write wins).

import type { Job } from "bullmq";
import { platformPrisma, type ExtendedPrismaClient } from "@marine-guardian/db";
import type { AreaRederiveJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";
import {
  applyAreaDerivation,
  type AreaDerivationResult,
} from "../lib/area-derivation";

/**
 * applyAreaDerivation types its Prisma arg against `ExtendedPrismaClient`
 * (the tenant-guarded, encryption-extended client). The worker process
 * runs outside the request lifecycle and uses `platformPrisma` (the
 * unextended client) by design — its queries always pass an explicit
 * tenantId so the L6 tenant-guard would be a no-op and the encryption
 * extension is not needed for any of the columns touched by 5.1b
 * (tenantId / areaName / locationLat / locationLon / areaBoundaryId /
 * areaDerivedAt are all plaintext).
 *
 * The runtime shape of platformPrisma is structurally compatible with
 * ExtendedPrismaClient for every model + method called by the helper
 * (event/patrol/fuelEntry.findUniqueOrThrow + .update, areaBoundary.findMany).
 * Cast through `unknown` to satisfy the type contract without a runtime cost.
 */
const prisma: ExtendedPrismaClient =
  platformPrisma as unknown as ExtendedPrismaClient;

export async function processAreaRederive(
  job: Job<AreaRederiveJobPayload>,
): Promise<AreaDerivationResult> {
  validateTenantContext(job.data);

  const { entity, id } = job.data;
  return applyAreaDerivation(prisma, entity, id);
}
