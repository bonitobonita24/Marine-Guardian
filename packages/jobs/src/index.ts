export { getConnection } from "./connection.js";

export {
  getQueue,
  closeAllQueues,
  getErSyncQueue,
  enqueueErSync,
  scheduleRecurringErSync,
  getAlertsQueue,
  enqueueAlert,
  getEmailQueue,
  enqueueEmail,
  getMaintenanceQueue,
  enqueueMaintenance,
  scheduleRecurringMaintenance,
  QUEUE_NAMES,
  type QueueName,
  type JobPayloadMap,
  type BaseJobPayload,
  type ErSyncJobPayload,
  type AlertJobPayload,
  type EmailJobPayload,
  type MaintenanceJobPayload,
} from "./queues/index.js";

export {
  createWorker,
  validateTenantContext,
  type WorkerOptions,
} from "./workers/index.js";
