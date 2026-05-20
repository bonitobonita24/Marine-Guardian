export { getConnection } from "./connection";

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
  getAreaRederiveQueue,
  enqueueAreaRederive,
  QUEUE_NAMES,
  type QueueName,
  type JobPayloadMap,
  type BaseJobPayload,
  type ErSyncJobPayload,
  type AlertJobPayload,
  type EmailJobPayload,
  type MaintenanceJobPayload,
  type AreaRederiveJobPayload,
} from "./queues/index";

export {
  createWorker,
  validateTenantContext,
  type WorkerOptions,
  startAreaRederiveWorker,
  AREA_REDERIVE_LIMITER,
  AREA_REDERIVE_CONCURRENCY,
} from "./workers/index";

// 5.1c — re-export the area-derivation helper so apps/web (5.1e admin
// manual-rebuild tRPC mutation) can consume the helper through the
// stable @marine-guardian/jobs package boundary instead of reaching
// into a deeper path.
export {
  applyAreaDerivation,
  type PrismaClientLike,
  type AreaDerivationEntity,
  type AreaDerivationResult,
} from "./lib/area-derivation";
