import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory.js";
import type { EmailJobPayload } from "./types.js";
import { QUEUE_NAMES } from "./types.js";

export function getEmailQueue(): Queue<EmailJobPayload> {
  return getQueue(QUEUE_NAMES.EMAIL);
}

export async function enqueueEmail(payload: EmailJobPayload): Promise<string> {
  const queue = getEmailQueue();
  const job = await queue.add("email:send", payload, {
    jobId: `email:${payload.tenantId}:${payload.to}:${Date.now()}`,
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10_000,
    },
  });
  return job.id ?? "";
}
