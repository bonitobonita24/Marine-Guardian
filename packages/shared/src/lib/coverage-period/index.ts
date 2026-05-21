// Barrel export for coverage-period pure functions.
// Consumed by 6.1a server query helper + the print-render page dispatch.

export { buildPeriod } from "./build-period";
export { getMonthlyPeriod } from "./get-monthly-period";
export { getAnnualPeriod } from "./get-annual-period";
export { getWeeklyPeriod } from "./get-weekly-period";
export { getMonthWeekPeriods } from "./get-month-week-periods";
export { getLastCompletedWeek } from "./get-last-completed-week";
export { patrolStartsWithinPeriod } from "./patrol-starts-within-period";
export {
  getSelectedTemplatePeriod,
  type SelectedTemplatePeriodInput,
} from "./get-selected-template-period";
export type { Period, PeriodCategory, PatrolForPeriod } from "./types";
export { DEFAULT_TENANT_OFFSET_MINUTES } from "./types";
