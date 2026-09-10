import { z } from "zod";
import { approvedAccountAccessSchema } from "./auth-context.js";
import { calendarDateSchema } from "./data-query-base-rows.js";
import { namedEvidenceScopeSchema } from "./named-dimension.js";

const label = z.string().min(1).max(512).refine(value => [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
const values = label.array().min(1).max(1000).refine(items => new Set(items).size === items.length, "Duplicate filter values");
/** Empty selection is represented by an omitted key, never silently by malformed input. */
export const dashboardFiltersSchema = z.object({ optimizer: values.optional(), biz: values.optional(),
  resource_position: values.optional(), goal: values.optional(),
  task_id: values.refine(items => items.every(value => value.length <= 256), "Task ID exceeds bound").optional() }).strict();
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
export const dashboardLabelsSchema = z.object({ optimizer: label.nullable(), biz: label.nullable(),
  placement: label.nullable(), goal: label.nullable(), taskId: label.nullable() }).strict();
const fields = { optimizer: "optimizer", biz: "biz", resource_position: "placement", goal: "goal", task_id: "taskId" } as const;
export function matchesDashboardFilters(rawRow: unknown, rawFilters: unknown): boolean {
  return compileDashboardFilters(rawFilters)(rawRow);
}
/** Validate once per query, then O(number of selected dimensions) per account-day. */
export function compileDashboardFilters(rawFilters: unknown): (rawRow: unknown) => boolean {
  const filters = dashboardFiltersSchema.parse(rawFilters);
  const selections = (Object.keys(fields) as (keyof typeof fields)[]).flatMap(key => {
    const selected = filters[key]; return selected === undefined ? [] : [{ field: fields[key], values: new Set(selected) }];
  });
  return rawRow => {
    const row = dashboardLabelsSchema.parse(rawRow);
    return selections.every(({ field, values }) => row[field] !== null && values.has(row[field]));
  };
}
export const accountDayScopeSchema = approvedAccountAccessSchema.pick({ media: true, accountId: true }).extend({ ds: calendarDateSchema }).strict();
export const boundedAccountDaysSchema = accountDayScopeSchema.array().max(10000).refine(
  rows => new Set(rows.map(row => JSON.stringify([row.media, row.accountId, row.ds]))).size === rows.length, "Duplicate account-day");
export type AccountDayScope = z.infer<typeof accountDayScopeSchema>;
export const dashboardDayRequestSchema = namedEvidenceScopeSchema.safeExtend({ dateFrom: calendarDateSchema, dateTo: calendarDateSchema })
  .refine(value => value.dateFrom <= value.dateTo && (Date.parse(value.dateTo) - Date.parse(value.dateFrom)) / 86400000 < 31);
export const dashboardAccountDaySchema = accountDayScopeSchema.extend({ workspaceId: z.string().uuid(),
  taskId: label.nullable(), taskName: label.nullable(), bizName: label.nullable() }).strict();
export type DashboardAccountDay = z.infer<typeof dashboardAccountDaySchema>;
