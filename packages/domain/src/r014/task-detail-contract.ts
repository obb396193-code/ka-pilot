import { z } from "zod";

import { canonicalMetricValueSchema } from "../metric-value.js";
import { taskListReadinessSchema, taskStageSchema, taskStageSourceSchema } from "../task-list-contract.js";

// v1.5.1 ② 任务详情（D5）。fixture task-detail/overview-v151.json 即契约。
const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict();

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTimestampSchema = z.string().datetime({ offset: true });

/** 八页签定稿（v1.5.1 ②），顺序即产品语义，不许重排。 */
export const TASK_DETAIL_TABS = [
  "overview", "data", "accounts", "materials", "sop", "work_items", "timeline", "reports",
] as const;

export const taskDetailTaskSchema = z.object({
  taskId: z.string().min(1).max(128),
  taskName: z.string().nullable(),
  bizName: z.string().nullable(),
  status: z.string().min(1),
  period: z.object({ start: calendarDateSchema, end: calendarDateSchema }).strict().nullable(),
  owner: z.object({ userId: z.string().uuid(), displayName: z.string().min(1) }).strict().nullable(),
  budget: canonicalMetricValueSchema,
}).strict();

export const taskSopStepSchema = z.object({
  key: z.enum(["prepare", "open", "recharge", "build", "cold_start", "deliver_monitor"]),
  status: z.enum(["done", "running", "pending", "skipped"]),
  at: isoTimestampSchema.nullable(),
}).strict();

export const taskSopProgressSchema = z.object({
  /** 没有绑定 run 时 runId 为 null，步骤按 stage 推导（v1.5.1 ② 明写）。 */
  runId: z.string().uuid().nullable(),
  steps: z.array(taskSopStepSchema),
}).strict();

export const taskBlockerSchema = z.object({
  kind: z.enum(["work_item", "dispatch", "escalation", "readiness"]),
  ref: z.string().min(1),
  title: z.string().min(1),
  severity: z.string().min(1).nullable(),
}).strict();

export const taskNextActionSchema = z.object({
  kind: z.enum(["work_item", "dispatch", "escalation", "readiness"]),
  ref: z.string().min(1),
  title: z.string().min(1),
}).strict();

export const taskDetailOverviewSchema = z.object({
  targetVolume: canonicalMetricValueSchema,
  achieved: canonicalMetricValueSchema,
  achievementRate: ratioValueSchema,
  timeProgress: ratioValueSchema,
  pacing: z.record(z.string(), z.unknown()).nullable(),
  anomalySummary: z.object({
    p0: z.number().int().nonnegative(),
    p1: z.number().int().nonnegative(),
    opportunity: z.number().int().nonnegative(),
  }).strict(),
  assessmentPrice: z.object({
    current: z.number().finite(),
    effectiveDate: calendarDateSchema,
    historyCount: z.number().int().nonnegative(),
  }).strict().nullable(),
  stage: z.object({
    value: taskStageSchema,
    source: taskStageSourceSchema,
    changedAt: isoTimestampSchema.nullable(),
  }).strict(),
  // 详情级比列表级多一个 overall（v1.5.1 ②：「readiness（同上，含 overall:RV）」）。
  readiness: taskListReadinessSchema.extend({ overall: ratioValueSchema }).strict(),
  sopProgress: taskSopProgressSchema.nullable(),
  /** 只来自真实的工作项/派发/升级/就绪缺项，**不生成**（v1.5.1 ② 明写）。 */
  blockers: z.array(taskBlockerSchema),
  nextActions: z.array(taskNextActionSchema),
  /**
   * 窗口口径块（cost / costStatus / costStatusReason / onTarget）与日预算卡三项。
   * 前者要 `PlatformWindowQuery`（R-010a1，Codex）、后者要 `task_budget_history`（014），
   * 本批都没有源 → 一律 null。**不拿任务级 budget 或日消耗凑一个出来。**
   */
  cost: z.record(z.string(), z.unknown()).nullable(),
  costStatus: z.enum(["green", "yellow", "red"]).nullable(),
  costStatusReason: z.string().min(1).nullable(),
  onTarget: z.boolean().nullable(),
  budgetUsageRate: ratioValueSchema.nullable(),
  budgetUsageDate: calendarDateSchema.nullable(),
  dailyBudgetCap: z.object({
    current: z.number().finite(),
    effectiveDate: calendarDateSchema,
    historyCount: z.number().int().nonnegative(),
  }).strict().nullable(),
}).strict();

export const taskDetailSchema = z.object({
  task: taskDetailTaskSchema,
  overview: taskDetailOverviewSchema,
  tabs: z.array(z.enum(TASK_DETAIL_TABS)).length(TASK_DETAIL_TABS.length),
}).strict().superRefine((value, context) => {
  if (value.tabs.join(",") !== TASK_DETAIL_TABS.join(",")) {
    context.addIssue({ code: "custom", message: "tabs must keep the frozen order", path: ["tabs"] });
  }
});
export type TaskDetail = z.infer<typeof taskDetailSchema>;

/**
 * 没有绑定 SOP run 时按 stage 推导六步（v1.5.1 ②：「无绑定 run 时按 stage 推导 steps，runId=null」）。
 * 推导出来的步骤**没有时间戳**——那是真发生过才有的东西，编一个时间就是造假。
 */
const SOP_STEPS = ["prepare", "open", "recharge", "build", "cold_start", "deliver_monitor"] as const;
const STAGE_TO_STEP: Record<z.infer<typeof taskStageSchema>, number> = {
  preparing: 0, opening: 1, recharging: 2, building: 3, cold_start: 4, delivering: 5, ended: 6,
};

export function deriveSopProgressFromStage(stage: z.infer<typeof taskStageSchema>): z.infer<typeof taskSopProgressSchema> {
  const reached = STAGE_TO_STEP[stage];
  return taskSopProgressSchema.parse({
    runId: null,
    steps: SOP_STEPS.map((key, index) => ({
      key,
      status: index < reached ? "done" : index === reached ? "running" : "pending",
      at: null,
    })),
  });
}
