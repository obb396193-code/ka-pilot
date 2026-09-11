import { z } from "zod"

import { ratioValueSchema } from "./canonical-query-rows.ts"
import {
  requestIdSchema,
  stableDataQueryErrorSchema,
  type StableDataQueryError,
} from "./contracts.ts"

export const taskListCalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}, "date must be a real calendar date")

export const taskListStatusSchema = z.enum(["preparing", "active", "ended"])

export const taskListRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
  status: taskListStatusSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  periodFrom: taskListCalendarDateSchema.optional(),
  periodTo: taskListCalendarDateSchema.optional(),
  hasOpenWorkItems: z.boolean().optional(),
}).strict().superRefine((request, context) => {
  if (request.periodFrom !== undefined && request.periodTo !== undefined && request.periodFrom > request.periodTo) {
    context.addIssue({
      code: "custom",
      path: ["periodTo"],
      message: "periodFrom must not be after periodTo",
    })
  }
})
export type TaskListRequest = z.infer<typeof taskListRequestSchema>

const nullableNonnegativeNumberSchema = z.number().finite().nonnegative().nullable()
const workItemCountsSchema = z.object({
  P0: z.number().int().nonnegative(),
  P1: z.number().int().nonnegative(),
  P2: z.number().int().nonnegative(),
  opportunity: z.number().int().nonnegative(),
}).strict()

const taskWorkItemSummarySchema = z.object({
  openCount: z.number().int().nonnegative(),
  highestSeverity: z.enum(["P0", "P1", "P2", "opportunity"]).nullable(),
  counts: workItemCountsSchema,
}).strict().superRefine((summary, context) => {
  const total = Object.values(summary.counts).reduce((sum, count) => sum + count, 0)
  if (summary.openCount !== total) {
    context.addIssue({ code: "custom", path: ["openCount"], message: "openCount must equal the severity counts" })
  }
  const expectedHighest = summary.counts.P0 > 0
    ? "P0"
    : summary.counts.P1 > 0
      ? "P1"
      : summary.counts.P2 > 0
        ? "P2"
        : summary.counts.opportunity > 0
          ? "opportunity"
          : null
  if (summary.highestSeverity !== expectedHighest) {
    context.addIssue({ code: "custom", path: ["highestSeverity"], message: "highestSeverity must match the highest nonzero severity" })
  }
})

const taskListPacingSchema = z.object({
  asOf: taskListCalendarDateSchema,
  elapsedDays: z.number().int().nonnegative(),
  totalDays: z.number().int().positive(),
  remainingDays: z.number().int().nonnegative(),
  targetProgress: ratioValueSchema,
  timeProgress: ratioValueSchema,
  projectedVolume: nullableNonnegativeNumberSchema,
  projectedCompletion: ratioValueSchema,
  projectedGap: nullableNonnegativeNumberSchema,
  requiredDailyVolume: ratioValueSchema,
  budgetProgress: ratioValueSchema,
}).strict()


// v1.5.1 ②：六段就绪度；没有系统来源的段 ratio 是 undefined 而不是 0。
const taskReadinessEntrySchema = z.object({
  ratio: z.object({
    value: z.number().finite().nullable(),
    state: z.enum(["finite", "infinite", "undefined"]),
  }).strict(),
  ready: z.boolean(),
  source: z.enum(["system", "manual"]),
  missing: z.array(z.string()),
}).strict()

const taskListItemSchema = z.object({
  taskId: z.string().min(1).max(128),
  taskName: z.string().nullable(),
  bizName: z.string().nullable(),
  status: taskListStatusSchema,
  period: z.object({ start: taskListCalendarDateSchema, end: taskListCalendarDateSchema }).strict().refine(
    (period) => period.start <= period.end,
    "period start must not be after period end",
  ).nullable(),
  owner: z.object({ userId: z.string().uuid(), displayName: z.string().min(1) }).strict().nullable(),
  assessmentPrice: z.object({ value: z.number().finite().nonnegative(), effectiveDate: taskListCalendarDateSchema }).strict().nullable(),
  volume: z.object({ target: nullableNonnegativeNumberSchema, completed: nullableNonnegativeNumberSchema }).strict().nullable(),
  pacing: taskListPacingSchema.nullable(),
  linkedAccountCount: z.number().int().nonnegative(),
  workItemSummary: taskWorkItemSummarySchema,
  // v1.5.1 ②（S6）与 domain 侧同步转必填。
  stage: z.enum(["preparing", "opening", "recharging", "building", "cold_start", "delivering", "ended"]),
  stageSource: z.enum(["system", "manual", "workflow"]),
  readiness: z.object({
    accounts: taskReadinessEntrySchema,
    recharge: taskReadinessEntrySchema,
    products: taskReadinessEntrySchema,
    materials: taskReadinessEntrySchema,
    strategy: taskReadinessEntrySchema,
    infra: taskReadinessEntrySchema,
  }).strict(),
  nextMilestone: z.object({
    at: taskListCalendarDateSchema,
    label: z.string().min(1),
  }).strict().nullable(),
  // v1.9.28 任务管理视图（后端 be2 Q-043）：与 packages/domain/src/task-list-contract.ts 同为必填。
  // 这层镜像漏一个键，BFF 就会把真响应当成 UPSTREAM_INVALID_RESPONSE 挡掉——那正是它的用处。
  aliases: z.array(z.string()),
  monitorUrl: z.string().nullable(),
  productName: z.string().nullable(),
}).strict()

const taskListSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(taskListItemSchema),
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
}).strict()

const taskListErrorSchema = z.object({
  ok: z.literal(false),
  error: stableDataQueryErrorSchema,
}).strict()

export const taskListResponseSchema = z.discriminatedUnion("ok", [taskListSuccessSchema, taskListErrorSchema])
export type TaskListResponse = z.infer<typeof taskListResponseSchema>
export type TaskListErrorCode = StableDataQueryError["code"]
