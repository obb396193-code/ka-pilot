import { z } from "zod";

import { calendarDateSchema } from "./data-query-base-rows.js";
import { dashboardFiltersSchema, type DashboardFilters } from "./dashboard-filters.js";

/**
 * v1.9.27 ④（Q-041 ①）`GET /data/filters` 的**纯算部分**：把「账户×天 + 标签 + 花费」
 * 折成四组级联选项。IO（读天网格、读解析证据、读花费）在 worker 侧，这里只做分组，
 * 好让「只列 cost>0」「下游随上游收窄」这两条规则能脱库验。
 *
 * 两条口径写死在这里：
 * - **只列窗口内 cost>0 的项**：花了 0 的选项点进去必然是空页面，列出来只是让人白点一次；
 *   但 cost 缺失（拉数失败/没跑）与 cost=0 不是一回事，缺失的天不计入求和也不当 0。
 * - **下游随上游收窄**：优化师 → 业务 → 任务 → 资源位，每一级只在**它上游已选中的那些天**里统计。
 *   四级各自用全量算的话，用户选了优化师甲之后还会看到只属于乙的任务，点下去空数据。
 */
export const filterOptionSchema = z.object({
  key: z.string().min(1).max(256),
  label: z.string().min(1).max(256),
  cost: z.number().finite().nonnegative(),
}).strict();
export type FilterOption = z.infer<typeof filterOptionSchema>;

export const dashboardFilterOptionsSchema = z.object({
  optimizers: z.array(filterOptionSchema),
  bizs: z.array(filterOptionSchema),
  tasks: z.array(filterOptionSchema),
  resource_positions: z.array(filterOptionSchema),
}).strict();
export type DashboardFilterOptions = z.infer<typeof dashboardFilterOptionsSchema>;

/**
 * 账户×天的花费（仓储读出来的原样）。`cost === null` = 那天取不到，**不是 0**。
 * schema 放 domain：db 包不直接依赖 zod，形状一律从这边来。
 */
export const accountDayCostSchema = z.object({
  media: z.string().min(1).max(32),
  accountId: z.string().min(1).max(128),
  ds: calendarDateSchema,
  cost: z.number().finite().nullable(),
}).strict();
export type AccountDayCost = z.infer<typeof accountDayCostSchema>;

/** 一个账户-天：它的四个标签与当天花费。`cost === null` = 这天的花费取不到（不是 0）。 */
export const filterOptionDaySchema = z.object({
  media: z.string().min(1).max(32),
  accountId: z.string().min(1).max(128),
  ds: calendarDateSchema,
  optimizer: z.string().min(1).nullable(),
  biz: z.string().min(1).nullable(),
  taskId: z.string().min(1).nullable(),
  taskName: z.string().min(1).nullable(),
  resourcePosition: z.string().min(1).nullable(),
  cost: z.number().finite().nullable(),
}).strict();
export type FilterOptionDay = z.infer<typeof filterOptionDaySchema>;

/** 级联顺序：上游在前。改这个数组就等于改级联关系，别散在四处各写一遍。 */
const CASCADE = ["optimizer", "biz", "task_id", "resource_position"] as const;

type Level = typeof CASCADE[number];

function valueOf(day: FilterOptionDay, level: Level): string | null {
  if (level === "optimizer") return day.optimizer;
  if (level === "biz") return day.biz;
  if (level === "task_id") return day.taskId;
  return day.resourcePosition;
}

function selected(filters: DashboardFilters, level: Level): readonly string[] | undefined {
  if (level === "optimizer") return filters.optimizer;
  if (level === "biz") return filters.biz;
  if (level === "task_id") return filters.task_id;
  return filters.resource_position;
}

/** 上游各级都命中（某级没选就不约束）。 */
function matchesUpstream(day: FilterOptionDay, filters: DashboardFilters, level: Level): boolean {
  for (const upstream of CASCADE) {
    if (upstream === level) return true;
    const chosen = selected(filters, upstream);
    if (chosen === undefined || chosen.length === 0) continue;
    const value = valueOf(day, upstream);
    if (value === null || !chosen.includes(value)) return false;
  }
  return true;
}

function group(days: readonly FilterOptionDay[], filters: DashboardFilters, level: Level,
  labelOf: (day: FilterOptionDay) => string | null): FilterOption[] {
  const totals = new Map<string, { label: string; cost: number }>();
  for (const day of days) {
    if (!matchesUpstream(day, filters, level)) continue;
    const value = valueOf(day, level);
    // 未标注的账户不进选项：它不是一个可筛的值，前端有专门的「未标注」桶。
    if (value === null) continue;
    // 花费取不到的那天不计入求和，也不当 0——两者在「要不要列这个选项」上结论可能相反。
    if (day.cost === null) continue;
    const existing = totals.get(value) ?? { label: labelOf(day) ?? value, cost: 0 };
    totals.set(value, { label: existing.label, cost: existing.cost + day.cost });
  }
  return [...totals.entries()]
    .filter(([, total]) => total.cost > 0)
    .map(([key, total]) => filterOptionSchema.parse({ key, label: total.label, cost: total.cost }))
    // 花得多的排前面；同额按 key 稳定排序，免得两次请求顺序不一样。
    .sort((left, right) => right.cost - left.cost || left.key.localeCompare(right.key));
}

export function buildDashboardFilterOptions(
  rawDays: readonly unknown[], rawFilters: unknown,
): DashboardFilterOptions {
  const days = z.array(filterOptionDaySchema).max(10000).parse(rawDays);
  const filters = dashboardFiltersSchema.parse(rawFilters ?? {});
  return dashboardFilterOptionsSchema.parse({
    optimizers: group(days, filters, "optimizer", (day) => day.optimizer),
    bizs: group(days, filters, "biz", (day) => day.biz),
    // 任务的 key 是 task_id、label 是任务名：筛选要按 id，人看的是名字。
    tasks: group(days, filters, "task_id", (day) => day.taskName ?? day.taskId),
    resource_positions: group(days, filters, "resource_position", (day) => day.resourcePosition),
  });
}
