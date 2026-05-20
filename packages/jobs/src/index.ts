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

// 5.2a — re-export the patrol-track-materialization helper. Same arc as
// 5.1c: apps/web (5.2c admin manual-rebuild tRPC mutation) and the 5.2b
// BullMQ processor both consume the helper through this package boundary.
// PrismaClientLike intentionally NOT re-exported here — it is the same
// ExtendedPrismaClient alias already exported from area-derivation above;
// re-exporting would collide on the type name. Importers that need the
// type can use the area-derivation re-export.
export {
  materializePatrolTrack,
  type MaterializationResult,
  type MaterializationSkipReason,
} from "./lib/patrol-track-materialization";
