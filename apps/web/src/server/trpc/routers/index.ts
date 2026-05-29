import { router } from "../trpc";
import { eventRouter } from "./event";
import { patrolRouter } from "./patrol";
import { subjectRouter } from "./subject";
import { observationRouter } from "./observation";
import { patrolAreaRouter } from "./patrolArea";
import { areaBoundaryRouter } from "./areaBoundary";
import { patrolTrackRouter } from "./patrolTrack";
import { patrolScheduleRouter } from "./patrolSchedule";
import { eventTypeRouter } from "./eventType";
import { alertRuleRouter } from "./alertRule";
import { alertHistoryRouter } from "./alertHistory";
import { notificationRouter } from "./notification";
import { syncLogRouter } from "./syncLog";
import { userRouter } from "./user";
import { knownRangerRouter } from "./knownRanger";
import { dashboardRouter } from "./dashboard";
import { mapRouter } from "./map";
import { rangerRouter } from "./ranger";
import { fuelEntryRouter } from "./fuelEntry";
import { reportExportRouter } from "./reportExport";
import { platformRouter } from "./platform";
import { platformUserRouter } from "./platformUser";
import { platformImpersonationRouter } from "./platformImpersonation";

export const appRouter = router({
  platform: platformRouter,
  platformUser: platformUserRouter,
  platformImpersonation: platformImpersonationRouter,
  event: eventRouter,
  patrol: patrolRouter,
  subject: subjectRouter,
  observation: observationRouter,
  patrolArea: patrolAreaRouter,
  areaBoundary: areaBoundaryRouter,
  patrolTrack: patrolTrackRouter,
  patrolSchedule: patrolScheduleRouter,
  eventType: eventTypeRouter,
  alertRule: alertRuleRouter,
  alertHistory: alertHistoryRouter,
  notification: notificationRouter,
  syncLog: syncLogRouter,
  user: userRouter,
  knownRanger: knownRangerRouter,
  dashboard: dashboardRouter,
  map: mapRouter,
  ranger: rangerRouter,
  fuelEntry: fuelEntryRouter,
  reportExport: reportExportRouter,
});

export type AppRouter = typeof appRouter;
