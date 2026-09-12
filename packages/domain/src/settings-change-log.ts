import { z } from "zod";

// Standalone wire schema: Web may load this source directly without a .js resolver.
// Only the arch-owned settings/change-log.json shape is implemented here.
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
const common = z.object({
  at, effectiveDate: date,
  changedBy: z.object({ userId: z.string().uuid(), name: z.string().min(1).max(256) }).strict(),
  evidenceUrl: z.string().url().max(4096).nullable(),
});
export const settingsChangeLogKindSchema = z.enum(["assessment_price", "daily_budget_cap", "channel_coefficient"]);
// Internal pagination state, not an additional public row field.
export const settingsChangeLogPositionSchema = z.object({ v: z.literal(1), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
  .refine(v => date.safeParse(v.slice(0, 10)).success && Number.isFinite(Date.parse(v))),
  kind: z.enum(["assessment_price", "daily_budget_cap"]), id: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine(v => BigInt(v) <= 9223372036854775807n),
}).strict();
export const settingsChangeLogRequestSchema = z.object({
  kinds: z.array(settingsChangeLogKindSchema).min(1).max(3).refine(kinds => new Set(kinds).size === kinds.length).optional(),
  task_id: taskId.optional(), media: media.optional(), cursor: cursor.optional(),
}).strict();
export const settingsChangeLogItemSchema = z.discriminatedUnion("kind", [
  common.extend({ kind: z.literal("assessment_price"), scope: z.object({ taskId }).strict(),
    oldValue: value.nullable(), newValue: value, recomputedDays: z.number().int().nonnegative().optional() }).strict(),
  common.extend({ kind: z.literal("daily_budget_cap"), scope: z.object({ taskId }).strict(),
    oldValue: value.nullable(), newValue: value }).strict(),
  common.extend({ kind: z.literal("channel_coefficient"), scope: z.object({ media }).strict(),
    oldValue: coefficient.nullable(), newValue: coefficient }).strict(),
]);
export const settingsChangeLogDataSchema = z.object({ items: z.array(settingsChangeLogItemSchema).max(100), nextCursor: cursor.nullable() }).strict();
export const settingsChangeLogResponseSchema = z.object({ ok: z.literal(true), data: settingsChangeLogDataSchema,
  meta: z.object({ requestId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/) }).strict(),
}).strict();
export type SettingsChangeLogRequest = z.infer<typeof settingsChangeLogRequestSchema>;
export type SettingsChangeLogData = z.infer<typeof settingsChangeLogDataSchema>;
