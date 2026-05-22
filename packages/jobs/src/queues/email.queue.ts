import type { Queue } from "bullmq";
import { getQueue } from "./queue-factory";
import type { EmailJobPayload } from "./types";
import { QUEUE_NAMES } from "./types";

export function getEmailQueue(): Queue<EmailJobPayload> {
  return getQueue(QUEUE_NAMES.EMAIL);
}

export async function enqueueEmail(payload: EmailJobPayload): Promise<string> {
  const queue = getEmailQueue();
  const job = await queue.add("email:send", payload, {
    jobId: `email__${payload.tenantId}__${payload.to}__${String(Date.now())}`,
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10_000,
    },
  });
  return job.id ?? "";
}
