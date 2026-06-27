export { getConnection } from "./connection";

export {
  getQueue,
  closeAllQueues,
  getErSyncQueue,
  enqueueErSync,
  enqueueErSyncWithWatermark,
  scheduleRecurringErSync,
  removeRecurringErSync,
  getAlertsQueue,
  enqueueAlert,
  getEmailQueue,
  enqueueEmail,
  getMaintenanceQueue,
  enqueueMaintenance,
  scheduleRecurringMaintenance,
  getAreaRederiveQueue,
  enqueueAreaRederive,
  getPatrolTrackMaterializeQueue,
  enqueuePatrolTrackMaterialize,
  getPdfRenderQueue,
  enqueuePdfRender,
  QUEUE_NAMES,
  type QueueName,
  type JobPayloadMap,
  type BaseJobPayload,
  type ErSyncJobPayload,
  type AlertJobPayload,
  type EmailJobPayload,
  type MaintenanceJobPayload,
  type AreaRederiveJobPayload,
  type PatrolTrackMaterializeJobPayload,
  type PdfRenderJobPayload,
} from "./queues/index";

export {
  createWorker,
  validateTenantContext,
  type WorkerOptions,
  startAreaRederiveWorker,
  AREA_REDERIVE_LIMITER,
  AREA_REDERIVE_CONCURRENCY,
  startPatrolTrackMaterializeWorker,
  PATROL_TRACK_MATERIALIZE_LIMITER,
  PATROL_TRACK_MATERIALIZE_CONCURRENCY,
  startPdfRenderWorker,
  PDF_RENDER_LIMITER,
  PDF_RENDER_CONCURRENCY,
} from "./workers/index";

// 5.3b — re-export the pdf-renderer-client helper. Relocated from
// apps/web/src/server/lib/ to packages/jobs/src/lib/ in this sub-batch
// so the 5.3b processor + future apps/web consumers can both reach it
// through the stable @marine-guardian/jobs package boundary (same arc
// as 5.1c area-derivation + 5.2a patrol-track-materialization).
export {
  renderPdfViaService,
  PdfRendererError,
  type RenderPdfInput,
} from "./lib/pdf-renderer-client";

// 5.3b — re-export the processor's RenderResult so apps/web (5.3d admin
// UI list page surfaces filePath + fileSizeBytes from the result row)
// can reach the type through the stable package boundary.
export { type RenderResult } from "./processors/pdf-render.processor";

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

// Stage 3 — re-export the telegram-storage lib so consumers can import
// uploadDocumentToTelegram + getTelegramBotToken from the stable
// @marine-guardian/jobs package boundary (same arc as 5.1c area-derivation
// + 5.2a patrol-track-materialization).
export * from "./lib/telegram-storage";
