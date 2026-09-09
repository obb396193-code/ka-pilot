import { z } from "zod"

import { ratioValueSchema } from "../canonical-query-rows.ts"
import { requestIdSchema, stableDataQueryErrorSchema } from "../contracts.ts"
import { taskListCalendarDateSchema } from "../task-list-contracts.ts"

// I-001（arch 联调发现 /api/internal/accounts 404）。
// apps/web 不依赖 @ka/domain，契约按既有做法在前端侧镜像一份；
// 本文件逐字对应 packages/domain/src/account-list-contract.ts，改后端必须同步改这里，
// 否则 BFF 会以 UPSTREAM_INVALID_RESPONSE 挡住——那正是这层校验的用处。
export const accountLifecycleStageSchema = z.enum([
  "cold_start", "ramping", "stable", "declining", "paused", "closed", "unknown",
])

const tagSchema = z.string().trim().min(1).max(128)
const uniqueTagsSchema = z.array(tagSchema).max(10).superRefine((tags, context) => {
  if (new Set(tags).size !== tags.length) {
    context.addIssue({ code: "custom", message: "tags must be unique" })
  }
})

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
}).strict()
export type AccountListRequest = z.infer<typeof accountListRequestSchema>

const nullableFiniteNumberSchema = z.number().finite().nullable()

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
    // v1.5.1 ① 断量倒计时；velocity 无源时 hours missing、state unknown。
    cutoff: z.object({
      hours: z.object({
        value: z.number().finite().nullable(),
        availability: z.enum(["available", "missing", "error"]),
      }).strict(),
      state: z.enum(["ok", "warning", "critical", "unknown"]),
    }).strict(),
  }).strict().nullable(),
  // v1.5.1 ① 新增字段，与 domain 侧同步转必填：漏发一个 BFF 就该挡成 502。
  poolStatus: z.enum([
    "available", "assigned", "pending_open", "pending_recharge", "pending_build",
    "in_delivery", "paused", "closed", "abnormal",
  ]),
  poolStatusSource: z.enum(["system", "manual"]),
  product: z.object({ name: z.string().min(1), ref: z.string().min(1).nullable() }).strict().nullable(),
  dailyBudgetCap: z.number().finite().nullable(),
  capacityLoad: z.object({
    value: z.number().finite().nullable(),
    state: z.enum(["finite", "infinite", "undefined"]),
  }).strict(),
  lastAction: z.object({
    at: z.string().datetime({ offset: true }),
    kind: z.enum(["changeset", "external_change", "pool_status"]),
    summary: z.string().min(1),
  }).strict().nullable(),
  nextSuggestion: z.object({
    workItemId: z.string().uuid(),
    title: z.string().min(1),
  }).strict().nullable(),
}).strict().superRefine((item, context) => {
  if (new Set(item.tags).size !== item.tags.length) {
    context.addIssue({ code: "custom", path: ["tags"], message: "tags must be unique" })
  }
  for (let index = 1; index < item.linkedTasks.length; index += 1) {
    if (item.linkedTasks[index - 1]!.taskId >= item.linkedTasks[index]!.taskId) {
      context.addIssue({
        code: "custom",
        path: ["linkedTasks", index],
        message: "linkedTasks must be unique and sorted by taskId",
      })
    }
  }
})

const accountListSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(accountListItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    groupBy: z.enum(["none", "lifecycle", "product", "owner", "task"]).optional(),
  }).strict(),
  meta: z.object({
    dataState: z.enum(["ready", "empty", "partial", "stale"]),
    businessDate: taskListCalendarDateSchema,
    dataAsOf: z.string().datetime({ offset: true }).nullable(),
    coverage: z.object({ complete: z.boolean() }).strict(),
    selectedSource: z.literal("qihang"),
    requestId: requestIdSchema,
  }).strict(),
}).strict()

const accountListErrorSchema = z.object({
  ok: z.literal(false),
  error: stableDataQueryErrorSchema,
}).strict()

export const accountListResponseSchema = z.discriminatedUnion("ok", [
  accountListSuccessSchema,
  accountListErrorSchema,
])
export type AccountListResponse = z.infer<typeof accountListResponseSchema>
export type AccountListErrorCode = z.infer<typeof stableDataQueryErrorSchema>["code"]
