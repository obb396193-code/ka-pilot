import { z } from "zod";

import { requestIdSchema, stableDataQueryErrorSchema } from "./data-query-contract.js";
import { taskListCalendarDateSchema } from "./task-list-contract.js";

export const workItemListStatusSchema = z.enum([
  "open", "processing", "done", "ignored", "expired", "external_handled", "rejected", "escalated",
]);
export const workItemListSeveritySchema = z.enum(["P0", "P1", "P2", "opportunity"]);
export const workItemListTypeSchema = z.enum([
  "diagnosis", "dispatch", "self", "agent_question", "external_handled",
]);

export const workItemListRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
  status: workItemListStatusSchema.optional(),
  severity: workItemListSeveritySchema.optional(),
  type: workItemListTypeSchema.optional(),
  assigneeUserId: z.string().uuid().optional(),
  taskId: z.string().min(1).max(128).optional(),
}).strict();
export type WorkItemListRequest = z.infer<typeof workItemListRequestSchema>;

export const workItemListItemSchema = z.object({
  workItemId: z.string().uuid(),
  type: workItemListTypeSchema,
  status: workItemListStatusSchema,
  severity: workItemListSeveritySchema.nullable(),
  title: z.string().min(1),
  account: z.object({
    workspaceId: z.string().uuid(),
    media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
    accountId: z.string().min(1).max(128),
    accountName: z.string().nullable(),
  }).strict().nullable(),
  task: z.object({
    taskId: z.string().min(1).max(128),
    taskName: z.string().nullable(),
  }).strict().nullable(),
  assignee: z.object({
    userId: z.string().uuid(),
    displayName: z.string().min(1),
  }).strict().nullable(),
  slaDue: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type WorkItemListItem = z.infer<typeof workItemListItemSchema>;

const successSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(workItemListItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
  }).strict(),
  meta: z.object({
    dataState: z.enum(["ready", "empty", "partial", "stale"]),
    businessDate: taskListCalendarDateSchema,
    dataAsOf: z.string().datetime({ offset: true }).nullable(),
    coverage: z.object({ complete: z.boolean() }).strict(),
    selectedSource: z.literal("platform"),
    requestId: requestIdSchema,
  }).strict(),
}).strict();

const errorSchema = z.object({ ok: z.literal(false), error: stableDataQueryErrorSchema }).strict();

export const workItemListResponseSchema = z.discriminatedUnion("ok", [successSchema, errorSchema]);
export type WorkItemListResponse = z.infer<typeof workItemListResponseSchema>;
