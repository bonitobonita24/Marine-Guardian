import { router } from "../trpc";
import { eventRouter } from "./event";
import { patrolRouter } from "./patrol";
import { subjectRouter } from "./subject";
import { observationRouter } from "./observation";
import { patrolAreaRouter } from "./patrolArea";
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

export const appRouter = router({
  event: eventRouter,
  patrol: patrolRouter,
  subject: subjectRouter,
  observation: observationRouter,
  patrolArea: patrolAreaRouter,
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
});

export type AppRouter = typeof appRouter;
