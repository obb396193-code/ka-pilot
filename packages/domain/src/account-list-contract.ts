import { z } from "zod";

import {
  requestIdSchema,
  stableDataQueryErrorSchema,
} from "./data-query-contract.js";
import { ratioValueSchema } from "./data-query-rows.js";
import { canonicalMetricValueSchema } from "./metric-value.js";
import { taskListCalendarDateSchema } from "./task-list-contract.js";

export const accountLifecycleStageSchema = z.enum([
  "cold_start", "ramping", "stable", "declining", "paused", "closed", "unknown",
]);
export type AccountLifecycleStage = z.infer<typeof accountLifecycleStageSchema>;

const tagSchema = z.string().trim().min(1).max(128);
const uniqueTagsSchema = z.array(tagSchema).max(10).superRefine((tags, context) => {
  if (new Set(tags).size !== tags.length) {
    context.addIssue({ code: "custom", message: "tags must be unique" });
  }
});

/** v1.5.1 ① 九态库存；与投放六态 lifecycleStage 并存，不是同一维度。 */
export const accountPoolStatusSchema = z.enum([
  "available", "assigned", "pending_open", "pending_recharge", "pending_build",
  "in_delivery", "paused", "closed", "abnormal",
]);
export const accountPoolStatusSourceSchema = z.enum(["system", "manual"]);
export const accountGroupBySchema = z.enum(["none", "lifecycle", "product", "owner", "task"]);

export const accountListRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
  media: z.literal("KUAISHOU").optional(),
  stage: accountLifecycleStageSchema.optional(),
  starred: z.boolean().optional(),
  tags: uniqueTagsSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  status: z.string().trim().min(1).max(64).optional(),
  // v1.5.1 ①：库存态多值筛选、产品筛选、分组回显。
  poolStatus: z.array(accountPoolStatusSchema).min(1).max(9).optional(),
  product: z.string().trim().min(1).max(128).optional(),
  // 不用 .default()：默认值会往解析结果里塞键，破坏既有那批「精确形状」断言。
  groupBy: accountGroupBySchema.optional(),
}).strict();
export type AccountListRequest = z.infer<typeof accountListRequestSchema>;

const nullableFiniteNumberSchema = z.number().finite().nullable();

export const accountListItemSchema = z.object({
  workspaceId: z.string().uuid(),
  media: z.literal("KUAISHOU"),
  accountId: z.string().min(1).max(128),
  accountName: z.string().nullable(),
  status: z.string().max(64).nullable(),
  lifecycleStage: accountLifecycleStageSchema,
  starred: z.boolean(),
  tags: z.array(tagSchema),
  owner: z.object({
    userId: z.string().uuid(),
    displayName: z.string().min(1),
  }).strict().nullable(),
  linkedTasks: z.array(z.object({
    taskId: z.string().min(1).max(128),
    taskName: z.string().nullable(),
  }).strict()),
  metrics: z.object({
    businessDate: taskListCalendarDateSchema,
    cost: nullableFiniteNumberSchema,
    realConversion: nullableFiniteNumberSchema,
    realCpa: ratioValueSchema,
    assessmentPrice: nullableFiniteNumberSchema,
  }).strict().nullable(),
  balance: z.object({
    value: z.number().finite(),
    syncedAt: z.string().datetime({ offset: true }),
    /**
     * v1.5 4.2 断量倒计时 = balance / velocity。velocity 来自小时消耗
     * （`account.hourly`，arch ⑤ 已裁归 Codex），本仓库拿不到 →
     * hours 为 missing、state 为 unknown。**不拿日消耗除 24 冒充小时速度。**
     */
    cutoff: z.object({
      hours: canonicalMetricValueSchema,
      state: z.enum(["ok", "warning", "critical", "unknown"]),
    }).strict().optional(),
  }).strict().nullable(),
  // v1.5.1 ① 新增字段。**现在一律 optional 是迁移状态，不是设计**：
  // `fixtures/account-list/{ready,empty,partial,stale}.json` 还是 v1.2 形状（arch 的文件），
  // 设成必填会把它们和 Codex 的 parity 用例一起打红。四份 fixture 更新后应立刻转必填——
  // 否则服务层漏发这些字段不会有任何东西报警。已回抛 arch（Q-010）。
  poolStatus: accountPoolStatusSchema.optional(),
  poolStatusSource: accountPoolStatusSourceSchema.optional(),
  product: z.object({ name: z.string().min(1), ref: z.string().min(1).nullable() }).strict().nullable().optional(),
  /** 当前任务的日预算卡；源是 `task_budget_history`（migration 014，Codex）→ 落地前恒 null。 */
  dailyBudgetCap: z.number().finite().nullable().optional(),
  /** = 当日消耗 / 日预算卡；上面那项没有源时它也算不出来 → undefined，不按 0 代入。 */
  capacityLoad: ratioValueSchema.optional(),
  lastAction: z.object({
    at: z.string().datetime({ offset: true }),
    kind: z.enum(["changeset", "external_change", "pool_status"]),
    summary: z.string().min(1),
  }).strict().nullable().optional(),
  /** 只来自真实的 open 工作项；没有就是 null，**不生成假建议**（v1.5.1 ① 明写）。 */
  nextSuggestion: z.object({
    workItemId: z.string().uuid(),
    title: z.string().min(1),
  }).strict().nullable().optional(),
}).strict().superRefine((item, context) => {
  if (new Set(item.tags).size !== item.tags.length) {
    context.addIssue({ code: "custom", path: ["tags"], message: "tags must be unique" });
  }
  for (let index = 1; index < item.linkedTasks.length; index += 1) {
    if (item.linkedTasks[index - 1]!.taskId >= item.linkedTasks[index]!.taskId) {
      context.addIssue({
        code: "custom",
        path: ["linkedTasks", index],
        message: "linkedTasks must be unique and sorted by taskId",
      });
    }
  }
});
export type AccountListItem = z.infer<typeof accountListItemSchema>;

const accountListSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(accountListItemSchema),
    groupBy: accountGroupBySchema.optional(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
  }).strict(),
  meta: z.object({
    dataState: z.enum(["ready", "empty", "partial", "stale"]),
    businessDate: taskListCalendarDateSchema,
    dataAsOf: z.string().datetime({ offset: true }).nullable(),
    coverage: z.object({ complete: z.boolean() }).strict(),
    selectedSource: z.literal("qihang"),
    requestId: requestIdSchema,
  }).strict(),
}).strict();

const accountListErrorSchema = z.object({
  ok: z.literal(false),
  error: stableDataQueryErrorSchema,
}).strict();

export const accountListResponseSchema = z.discriminatedUnion("ok", [
  accountListSuccessSchema,
  accountListErrorSchema,
]);
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
