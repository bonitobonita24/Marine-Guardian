// Export-janitor queue — the producer side of the ephemeral-export TTL sweep.
//
// There is no per-request enqueue path here on purpose: the janitor is driven
// SOLELY by a BullMQ repeatable registered at worker boot. Nothing in the
// request path should be able to schedule (or skip) a sweep.

import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { ExportJanitorJobPayload } from "./types";
import {
  EXPORT_JANITOR_PLATFORM_SENTINEL,
  EXPORT_JANITOR_SYSTEM_SENTINEL,
  QUEUE_NAMES,
} from "./types";

/**
 * Cron pattern for the sweep: every 5 minutes. Chosen against
 * EXPORT_TTL_MS (~30 min, see processors/export-janitor.processor.ts) so an
 * expired object lives at most TTL + 5 minutes, while each run stays cheap
 * (one bounded row page + one ListObjectsV2 page).
 */
export const EXPORT_JANITOR_CRON = "*/5 * * * *";

/**
 * FIXED repeatable jobId. Double underscores — BullMQ rejects `:` in jobIds
 * (repo lesson). Because it is fixed and carries no timestamp/tenant, calling
 * scheduleRecurringExportJanitor() on every worker boot is idempotent: BullMQ
 * collapses the re-registration onto the same repeatable instead of
 * accumulating one scheduler per restart.
 */
export const EXPORT_JANITOR_RECURRING_JOB_ID = "export-janitor__recurring";

export function getExportJanitorQueue(): Queue<ExportJanitorJobPayload> {
  return getQueue(QUEUE_NAMES.EXPORT_JANITOR);
}

export async function scheduleRecurringExportJanitor(): Promise<void> {
  const queue = getExportJanitorQueue();

  await queue.add(
    "export-janitor:sweep",
    {
      tenantId: EXPORT_JANITOR_PLATFORM_SENTINEL,
      userId: EXPORT_JANITOR_SYSTEM_SENTINEL,
    },
    {
      repeat: { pattern: EXPORT_JANITOR_CRON },
      jobId: EXPORT_JANITOR_RECURRING_JOB_ID,
    },
  );
}
