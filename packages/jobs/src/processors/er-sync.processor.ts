import type { Job } from "bullmq";
import type { ErSyncJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";

export async function processErSync(job: Job<ErSyncJobPayload>): Promise<void> {
  validateTenantContext(job.data);

  const { syncType, since, tenantId } = job.data;

  console.log(
    `[er-sync] syncType=${syncType} since=${since ?? "full"} tenant=${tenantId}`,
  );

  // TODO: implement actual ER sync logic against external API in Phase 8
  console.log(`[er-sync] Job ${job.id ?? "unknown"} processed (stub — no sync target configured yet)`);
}
