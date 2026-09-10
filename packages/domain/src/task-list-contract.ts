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

/** v1.9.28：加 `paused`（停投）。`ended` 仍表示任务期结束，两者不是一回事。 */
export const taskListStatusSchema = z.enum(["preparing", "active", "paused", "ended"]);

/**
 * v1.9.28 任务管理视图可编辑的四个字段（`PATCH /tasks/:id` 与 `POST /tasks/batch-save` 共用）。
 * 全部可选，但**至少要给一个**——空 patch 是调用方写错了，不是「什么都不改」。
 */
export const taskManageFieldsSchema = z.object({
  aliases: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  monitor_url: z.string().trim().max(2048).nullable().optional(),
  product_name: z.string().trim().max(200).nullable().optional(),
  status: taskListStatusSchema.optional(),
}).strict().refine(
  (fields) => Object.values(fields).some((value) => value !== undefined),
  "at least one field must be given",
);
export type TaskManageFields = z.infer<typeof taskManageFieldsSchema>;

/**
 * 整体保存一个业务大类下的若干任务。**全部成功才写**：一半写进去一半没写，
 * 页面上看不出是哪一半，用户只会再点一次保存，把成功的那半又写一遍。
 */
export const taskBatchSaveRequestSchema = z.object({
  items: z.array(z.object({ task_id: z.string().min(1).max(128) }).passthrough()).min(1).max(200),
}).strict();

/** 写回后的任务行（`PATCH /tasks/:id` 的 data，也是 batch-save 里 saved[] 的元素）。 */
export const taskManageRecordSchema = z.object({
  taskId: z.string().min(1).max(128),
  taskName: z.string().nullable(),
  bizName: z.string().nullable(),
  status: taskListStatusSchema,
  aliases: z.array(z.string()),
  monitorUrl: z.string().nullable(),
  productName: z.string().nullable(),
}).strict();
export const taskBatchSaveResponseSchema = z.object({
  saved: z.array(taskManageRecordSchema),
}).strict();

/** v1.5.1 ② 投放阶段七态；与 status 三态并存，不是同一维度（status 是任务生命周期）。 */
export const taskStageSchema = z.enum([
  "preparing", "opening", "recharging", "building", "cold_start", "delivering", "ended",
]);
export const taskStageSourceSchema = z.enum(["system", "manual", "workflow"]);
export type TaskStage = z.infer<typeof taskStageSchema>;
export type TaskStageSource = z.infer<typeof taskStageSourceSchema>;

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
    // v1.5.1 ② 新增。fixtures/task-list/* 已升到新形状（arch Q-011 批准），**现在必填**——
    // 留成 optional 的话，服务层漏发它们不会有任何东西报警。
    stage: taskStageSchema,
    stageSource: taskStageSourceSchema,
    readiness: taskListReadinessSchema,
    nextMilestone: z
      .object({ at: taskListCalendarDateSchema, label: z.string().min(1) })
      .strict()
      .nullable(),
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
