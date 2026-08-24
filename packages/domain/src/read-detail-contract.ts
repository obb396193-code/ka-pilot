import { z } from "zod";

import { requestIdSchema } from "./data-query-contract.js";

const jsonObjectSchema = z.record(z.string(), z.unknown());
const nullableDateTimeSchema = z.string().datetime({ offset: true }).nullable();
const accountScopeFields = {
  workspaceId: z.string().uuid(),
  media: z.string().min(1),
  accountId: z.string().min(1),
};

export const workItemDetailSchema = z.object({
  id: z.string().uuid(),
  ...accountScopeFields,
  type: z.enum(["diagnosis", "dispatch", "self", "agent_question", "external_handled"]),
  taskId: z.string().nullable(),
  ruleId: z.string().nullable(),
  severity: z.enum(["P0", "P1", "P2", "opportunity"]).nullable(),
  title: z.string().min(1),
  evidenceSnapshot: jsonObjectSchema.nullable(),
  diagnosis: jsonObjectSchema.nullable(),
  status: z.enum([
    "open", "processing", "done", "ignored", "expired", "external_handled",
    "rejected", "escalated",
  ]),
  ignoreReason: z.string().nullable(),
  mutedUntil: z.string().nullable(),
  assignee: z.string().uuid().nullable(),
  creator: z.string().uuid().nullable(),
  acceptanceCriteria: z.string().nullable(),
  slaDue: nullableDateTimeSchema,
  rejectReason: z.string().nullable(),
  t1Result: jsonObjectSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  resolvedAt: nullableDateTimeSchema,
}).strict();

export const changeSetDetailItemSchema = z.object({
  id: z.number().int().positive(),
  targetType: z.enum(["account", "campaign", "unit", "creative"]),
  targetId: z.string().min(1),
  field: z.string().min(1),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  itemStatus: z.enum(["pending", "success", "failed"]),
  failReason: z.string().nullable(),
}).strict();

export const changeSetDetailSchema = z.object({
  id: z.string().uuid(),
  ...accountScopeFields,
  workItemId: z.string().uuid().nullable(),
  title: z.string().nullable(),
  status: z.enum([
    "draft", "confirmed", "sent", "executing", "success", "partial", "failed",
    "unknown", "expired", "rolled_back",
  ]),
  initiatorUserId: z.string().uuid(),
  executorIdentity: z.string().nullable(),
  multicaIssueId: z.string().nullable(),
  ttlExpireAt: nullableDateTimeSchema,
  reasonCode: z.string().nullable(),
  simulation: jsonObjectSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  executedAt: nullableDateTimeSchema,
  items: z.array(changeSetDetailItemSchema),
}).strict();

export const readDetailErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "SOURCE_TRUNCATED",
  "INTERNAL_ERROR",
]);

export const readDetailResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("work_item"), workItem: workItemDetailSchema }).strict(),
      z.object({ kind: z.literal("changeset"), changeset: changeSetDetailSchema }).strict(),
    ]),
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: readDetailErrorCodeSchema,
      message: z.string().min(1),
      retryable: z.literal(false),
      requestId: requestIdSchema,
    }).strict(),
  }).strict(),
]);

export type WorkItemDetail = z.infer<typeof workItemDetailSchema>;
export type ChangeSetDetail = z.infer<typeof changeSetDetailSchema>;
export type ReadDetailResponse = z.infer<typeof readDetailResponseSchema>;
