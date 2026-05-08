import type { Job } from "bullmq";
import type { AlertJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";

export function processAlert(job: Job<AlertJobPayload>): Promise<void> {
  validateTenantContext(job.data);

  const { alertRuleId, eventId, priority, tenantId } = job.data;

  console.log(
    `[alerts] ruleId=${alertRuleId} eventId=${eventId} priority=${String(priority)} tenant=${tenantId}`,
  );

  // TODO: implement alert evaluation + notification dispatch in Phase 8
  console.log(`[alerts] Job ${job.id ?? "unknown"} processed (stub — no alert rules engine yet)`);

  return Promise.resolve();
}
