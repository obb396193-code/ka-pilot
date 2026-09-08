import { z } from "zod";

import { ratioValueSchema } from "./data-query-rows.js";
import {
  requestIdSchema,
  stableDataQueryErrorSchema,
} from "./data-query-contract.js";

const SHANGHAI_TASK_CUTOFF_OFFSET_MS = 5 * 60 * 60 * 1_000;

export const taskListCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "date must be a real calendar date");

export const taskListStatusSchema = z.enum(["preparing", "active", "ended"]);

/** v1.5.1 ② 投放阶段七态；与 status 三态并存，不是同一维度（status 是任务生命周期）。 */
export const taskStageSchema = z.enum([
  "preparing", "opening", "recharging", "building", "cold_start", "delivering", "ended",
]);
export const taskStageSourceSchema = z.enum(["system", "manual", "workflow"]);

const readinessRatioSchema = z
  .object({ value: z.number().finite().nullable(), state: z.enum(["finite", "infinite", "undefined"]) })
  .strict();

const readinessEntrySchema = z
  .object({
    ratio: readinessRatioSchema,
    ready: z.boolean(),
    source: z.enum(["system", "manual"]),
    missing: z.array(z.string()),
  })
  .strict();

/** 六段固定，缺一不可——少一段等于前端不知道那一段是「没查」还是「没准备」。 */
export const taskListReadinessSchema = z
  .object({
    accounts: readinessEntrySchema,
    recharge: readinessEntrySchema,
    products: readinessEntrySchema,
    materials: readinessEntrySchema,
    strategy: readinessEntrySchema,
    infra: readinessEntrySchema,
  })
  .strict();
export type TaskListStatus = z.infer<typeof taskListStatusSchema>;

export const taskListRequestSchema = z
  .object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    q: z.string().max(100).optional(),
    status: taskListStatusSchema.optional(),
    ownerUserId: z.string().uuid().optional(),
    periodFrom: taskListCalendarDateSchema.optional(),
    periodTo: taskListCalendarDateSchema.optional(),
    hasOpenWorkItems: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.periodFrom !== undefined &&
      request.periodTo !== undefined &&
      request.periodFrom > request.periodTo
    ) {
      context.addIssue({
        code: "custom",
        path: ["periodTo"],
        message: "periodFrom must not be after periodTo",
      });
    }
  });
export type TaskListRequest = z.infer<typeof taskListRequestSchema>;

const nullableNonnegativeNumberSchema = z.number().finite().nonnegative().nullable();

export const taskListPacingSchema = z
  .object({
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
  })
  .strict();
export type TaskListPacing = z.infer<typeof taskListPacingSchema>;

const workItemCountsSchema = z
  .object({
    P0: z.number().int().nonnegative(),
    P1: z.number().int().nonnegative(),
    P2: z.number().int().nonnegative(),
    opportunity: z.number().int().nonnegative(),
  })
  .strict();

export const taskWorkItemSummarySchema = z
  .object({
    openCount: z.number().int().nonnegative(),
    highestSeverity: z.enum(["P0", "P1", "P2", "opportunity"]).nullable(),
    counts: workItemCountsSchema,
  })
  .strict()
  .superRefine((summary, context) => {
    const total = Object.values(summary.counts).reduce((sum, count) => sum + count, 0);
    if (summary.openCount !== total) {
      context.addIssue({
        code: "custom",
        path: ["openCount"],
        message: "openCount must equal the severity counts",
      });
    }
    const expectedHighest = summary.counts.P0 > 0
      ? "P0"
      : summary.counts.P1 > 0
        ? "P1"
        : summary.counts.P2 > 0
          ? "P2"
          : summary.counts.opportunity > 0
            ? "opportunity"
            : null;
    if (summary.highestSeverity !== expectedHighest) {
      context.addIssue({
        code: "custom",
        path: ["highestSeverity"],
        message: "highestSeverity must match the highest nonzero severity",
      });
    }
  });
export type TaskWorkItemSummary = z.infer<typeof taskWorkItemSummarySchema>;

export const taskListItemSchema = z
  .object({
    taskId: z.string().min(1).max(128),
    taskName: z.string().nullable(),
    bizName: z.string().nullable(),
    status: taskListStatusSchema,
    period: z
      .object({
        start: taskListCalendarDateSchema,
        end: taskListCalendarDateSchema,
      })
      .strict()
      .refine((period) => period.start <= period.end, {
        message: "period start must not be after period end",
      })
      .nullable(),
    owner: z
      .object({
        userId: z.string().uuid(),
        displayName: z.string().min(1),
      })
      .strict()
      .nullable(),
    assessmentPrice: z
      .object({
        value: z.number().finite().nonnegative(),
        effectiveDate: taskListCalendarDateSchema,
      })
      .strict()
      .nullable(),
    volume: z
      .object({
        target: nullableNonnegativeNumberSchema,
        completed: nullableNonnegativeNumberSchema,
      })
      .strict()
      .nullable(),
    pacing: taskListPacingSchema.nullable(),
    linkedAccountCount: z.number().int().nonnegative(),
    workItemSummary: taskWorkItemSummarySchema,
    // v1.5.1 ② 新增。**optional 是迁移状态不是设计**：fixtures/task-list/*.json
    // 还是旧形状（arch 的文件），设成必填会当场打红既有 parity 用例。
    // fixture 升级后应立刻转必填，否则服务层漏发不会有任何东西报警。已回抛 arch。
    stage: taskStageSchema.optional(),
    stageSource: taskStageSourceSchema.optional(),
    readiness: taskListReadinessSchema.optional(),
    nextMilestone: z
      .object({ at: taskListCalendarDateSchema, label: z.string().min(1) })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type TaskListItem = z.infer<typeof taskListItemSchema>;

const taskListSuccessSchema = z
  .object({
    ok: z.literal(true),
    data: z
      .object({
        items: z.array(taskListItemSchema),
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    meta: z
      .object({
        dataState: z.enum(["ready", "empty", "partial", "stale"]),
        businessDate: taskListCalendarDateSchema,
        dataAsOf: z.string().datetime({ offset: true }).nullable(),
        coverage: z.object({ complete: z.boolean() }).strict(),
        selectedSource: z.literal("qihang"),
        requestId: requestIdSchema,
      })
      .strict(),
  })
  .strict();

const taskListErrorSchema = z
  .object({
    ok: z.literal(false),
    error: stableDataQueryErrorSchema,
  })
  .strict();

export const taskListResponseSchema = z.discriminatedUnion("ok", [
  taskListSuccessSchema,
  taskListErrorSchema,
]);
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

/**
 * Task operations use a fixed 03:00 Asia/Shanghai business-day boundary.
 * Shifting UTC by +5 hours is equivalent to Shanghai (+8) minus the cutoff (3).
 */
export function shanghaiTaskBusinessDate(now: Date = new Date()): string {
  const instant = now.valueOf();
  if (!Number.isFinite(instant)) throw new Error("now must be a valid instant");
  return new Date(instant + SHANGHAI_TASK_CUTOFF_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}
