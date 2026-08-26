import { z } from "zod";

import {
  requestIdSchema,
  stableDataQueryErrorSchema,
} from "./data-query-contract.js";
import { ratioValueSchema } from "./data-query-rows.js";
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
  }).strict().nullable(),
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
