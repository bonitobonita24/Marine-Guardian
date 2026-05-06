import type { Job } from "bullmq";
import type { EmailJobPayload } from "../queues/types";
import { validateTenantContext } from "../workers/base-worker";

export async function processEmail(job: Job<EmailJobPayload>): Promise<void> {
  validateTenantContext(job.data);

  const { to, subject, templateId, templateData, tenantId } = job.data;

  console.log(
    `[email] Sending template=${templateId} to=${to} subject="${subject}" tenant=${tenantId}`,
  );

  // TODO: wire up actual SMTP transport (nodemailer) in Phase 8
  // For now, log the email so the worker runs without error
  console.log(`[email] Template data:`, JSON.stringify(templateData));
  console.log(`[email] Job ${job.id ?? "unknown"} processed (stub — no SMTP configured yet)`);
}
