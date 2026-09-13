import { z } from "zod";

// Standalone wire schema: Web may load this source directly without a .js resolver.
// v1.9.44 supersedes the pre-id/op fixture; do not strip those version semantics.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !value.startsWith("0000-") && Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const at = z.string().datetime({ offset: true }).refine(value => date.safeParse(value.slice(0, 10)).success);
const taskId = z.string().min(1).max(128);
const media = z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/);
const cursor = z.string().min(1).max(1024);
const value = z.number().finite().nonnegative();
const coefficient = z.object({ op: z.enum(["multiply", "divide"]), coefficient: value }).strict();
// Internal mapper boundary: distinguish a missing actor join from an invalid value.
export const settingsChangeLogActorColumnsSchema = z.object({
  userId: z.string().uuid().nullable(), name: z.string().min(1).max(256).nullable(),
}).strict();
const common = z.object({
  id: z.string().min(1).max(128), op: z.enum(["set", "revoke"]), at, effectiveDate: date,
  changedBy: z.object({ userId: z.string().uuid(), name: z.string().min(1).max(256) }).strict().nullable(),
  evidenceUrl: z.string().url().max(4096).nullable(),
});
export const settingsChangeLogKindSchema = z.enum(["assessment_price", "daily_budget_cap", "channel_coefficient"]);
// Internal pagination state, not an additional public row field.
export const settingsChangeLogPositionSchema = z.object({ v: z.literal(1), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
  .refine(v => date.safeParse(v.slice(0, 10)).success && Number.isFinite(Date.parse(v))),
  kind: settingsChangeLogKindSchema, id: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine(v => BigInt(v) <= 9223372036854775807n),
}).strict();
export const settingsChangeLogRequestSchema = z.object({
  kinds: z.array(settingsChangeLogKindSchema).min(1).max(3).refine(kinds => new Set(kinds).size === kinds.length).optional(),
  task_id: taskId.optional(), media: media.optional(), cursor: cursor.optional(),
}).strict();
export const settingsChangeLogItemSchema = z.discriminatedUnion("kind", [
  common.extend({ kind: z.literal("assessment_price"), scope: z.object({ taskId }).strict(),
    oldValue: value.nullable(), newValue: value.nullable() }).strict(),
  common.extend({ kind: z.literal("daily_budget_cap"), scope: z.object({ taskId }).strict(),
    oldValue: value.nullable(), newValue: value.nullable() }).strict(),
  common.extend({ kind: z.literal("channel_coefficient"), scope: z.object({ media }).strict(),
    oldValue: coefficient.nullable(), newValue: coefficient.nullable() }).strict(),
]).superRefine((row, ctx) => {
  if ((row.op === "revoke") !== (row.newValue === null))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["newValue"], message: "Revoke must have null value; set must have a value" });
});
export const settingsChangeLogDataSchema = z.object({ items: z.array(settingsChangeLogItemSchema).max(100), nextCursor: cursor.nullable() }).strict();
export const settingsChangeLogResponseSchema = z.object({ ok: z.literal(true), data: settingsChangeLogDataSchema,
  meta: z.object({ requestId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/) }).strict(),
}).strict();
export type SettingsChangeLogRequest = z.infer<typeof settingsChangeLogRequestSchema>;
export type SettingsChangeLogData = z.infer<typeof settingsChangeLogDataSchema>;

/** URL boundary shared by Worker and BFF; comma-delimited kinds like task timeline. */
export function parseSettingsChangeLogSearch(search: URLSearchParams): SettingsChangeLogRequest {
  const input: Record<string, unknown> = {};
  for (const [key, val] of search) {
    if (!["kinds", "task_id", "media", "cursor"].includes(key) || Object.hasOwn(input, key)) throw new Error("Invalid change log query");
    input[key] = key === "kinds" ? val.split(",") : val;
  }
  return settingsChangeLogRequestSchema.parse(input);
}
