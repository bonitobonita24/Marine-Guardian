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
import { settingsRouter } from "./settings";
import { dsrRouter } from "./dsr";
import { breachRouter } from "./breach";
import { municipalityCoverageRouter } from "./municipalityCoverage";
import { municipalityRouter } from "./municipality";
import { reportMapRouter } from "./reportMap";
import { reportTemplateRouter } from "./reportTemplate";
import { accountRouter } from "./account";
import { customRoleRouter } from "./customRole";
import { doodleRouter } from "./doodle";

export const appRouter = router({
  account: accountRouter,
  customRole: customRoleRouter,
  settings: settingsRouter,
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
  dsr: dsrRouter,
  breach: breachRouter,
  municipalityCoverage: municipalityCoverageRouter,
  municipality: municipalityRouter,
  reportMap: reportMapRouter,
  reportTemplate: reportTemplateRouter,
  doodle: doodleRouter,
});

export type AppRouter = typeof appRouter;
