import { z } from "zod";

import type { RatioValue } from "../types.js";

// v1.7.3 `GET /tasks/:id/bindings` + v1.9 ⑨（scope 结构冻结、boundAt 018 前可空）。
// 铁律：无绑定 → 空数组 / null，**不用全局规则冒充**。

/** v1.9 ⑨ 冻结：三者取并集，空数组 = 不限。三者全空 = 全局规则，不算「绑在某个任务上」。 */
export const alertRuleScopeSchema = z.object({
  taskIds: z.array(z.string().min(1).max(128)).default([]),
  accountScopes: z.array(z.object({
    media: z.string().min(1).max(32),
    accountId: z.string().min(1).max(128),
  }).strict()).default([]),
  bizNames: z.array(z.string().min(1).max(128)).default([]),
}).strict();
export type AlertRuleScope = z.infer<typeof alertRuleScopeSchema>;

export const EMPTY_RULE_SCOPE: AlertRuleScope = { taskIds: [], accountScopes: [], bizNames: [] };

export interface TaskScopeFacts {
  taskId: string;
  bizName: string | null;
  accounts: readonly { media: string; accountId: string }[];
}

/**
 * 这条规则绑在这个任务上吗？返回绑定层级，没绑返回 null。
 *
 * **三者全空 = 全局规则 → 返回 null**：全局规则对每个任务都成立，
 * 把它列进「本任务的绑定」等于用全局规则冒充绑定，v1.7.3 明确禁止。
 */
export function ruleScopeBinding(scope: AlertRuleScope, task: TaskScopeFacts): "task" | "account" | null {
  const parsed = alertRuleScopeSchema.parse(scope);
  const isGlobal = parsed.taskIds.length === 0
    && parsed.accountScopes.length === 0
    && parsed.bizNames.length === 0;
  if (isGlobal) return null;
  if (parsed.taskIds.includes(task.taskId)) return "task";
  if (task.bizName !== null && parsed.bizNames.includes(task.bizName)) return "task";
  const bound = parsed.accountScopes.some((entry) =>
    task.accounts.some((account) => account.media === entry.media && account.accountId === entry.accountId));
  return bound ? "account" : null;
}

/* ── DTO（fixture rules/bindings-fixture-task-ready.json 即契约） ────── */

const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict();

export const boundRuleSchema = z.object({
  ruleId: z.number().int().positive(),
  name: z.string().min(1),
  type: z.string().min(1).nullable(),
  enabled: z.boolean(),
  autonomyLevel: z.number().int().min(1).max(3),
  scope: z.enum(["task", "account"]),
  // v1.9 ⑨：`alert_rules.bound_at` 是 018 才加的列，落地前一律 null，不拿创建时间冒充。
  boundAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const boundWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string().min(1),
  version: z.number().int().positive(),
  status: z.string().min(1),
  scope: z.literal("task"),
  lastRun: z.object({
    runId: z.string().uuid(),
    status: z.string().min(1).nullable(),
    at: z.string().datetime({ offset: true }),
  }).strict().nullable(),
}).strict();

export const taskSopSchema = z.object({
  sopRunId: z.string().uuid(),
  template: z.string().min(1),
  progress: ratioValueSchema,
}).strict();

export const taskBindingsSchema = z.object({
  taskId: z.string().min(1),
  rules: z.array(boundRuleSchema),
  workflows: z.array(boundWorkflowSchema),
  sop: taskSopSchema.nullable(),
}).strict();
export type TaskBindings = z.infer<typeof taskBindingsSchema>;

/** SOP 进度 = 已成功节点数 / 图上节点总数；图上没有节点就是算不出来，不是 0。 */
export function sopProgress(succeededNodes: number, totalNodes: number): RatioValue {
  if (!Number.isInteger(totalNodes) || totalNodes <= 0) return { value: null, state: "undefined" };
  return { value: Math.min(succeededNodes, totalNodes) / totalNodes, state: "finite" };
}
