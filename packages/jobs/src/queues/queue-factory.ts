import { Queue } from "bullmq";
import { getConnection } from "../connection";
import type { JobPayloadMap, QueueName } from "./types";

const queues = new Map<string, Queue>();

export function getQueue<T extends QueueName>(
  name: T,
): Queue<JobPayloadMap[T]> {
  const existing = queues.get(name);
  if (existing != null) {
    return existing as Queue<JobPayloadMap[T]>;
  }

  const queue = new Queue<JobPayloadMap[T]>(name, {
    connection: getConnection(),
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  });

  queues.set(name, queue as Queue);
  return queue;
}

export async function closeAllQueues(): Promise<void> {
  const promises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(promises);
  queues.clear();
}
