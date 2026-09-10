import { z } from "zod"
import { requestIdSchema } from "./contracts.ts"
import { changeValueSchema, sameChangeValue } from "../../../../packages/domain/src/change-value-schema.ts"
import { createPreflightPresentationSchemas } from "../../../../packages/domain/src/changeset-preflight-wire.ts"

export const { preflightPresentationResponseSchema } = createPreflightPresentationSchemas({ changeValueSchema, sameChangeValue })
type PreflightSuccess = Extract<z.infer<typeof preflightPresentationResponseSchema>, { ok: true }>

// Small, source-off command boundary; permanent parity tests use @ka/domain.
export const muteDaysSchema = z.union([z.literal(1), z.literal(3), z.literal(7)])
export const muteRequestSchema = z.object({ days: muteDaysSchema, reason_chip: z.string().max(4096) }).strict()
export const ignoreRequestSchema = z.object({ mute_days: muteDaysSchema.optional(), reason_chip: z.string().max(4096).optional() }).strict()
export const dryRunRequestSchema = z.object({}).strict()
export const muteResultSchema = z.object({
  mutedUntil: z.string().datetime({ offset: true }), scope: z.literal("notifications_and_p1p2"),
}).strict()
export const commandSuccessSchema = z.object({
  ok: z.literal(true), data: muteResultSchema, meta: z.object({ requestId: requestIdSchema }).strict(),
}).strict()
// F8-15 ④（契约 v1.9.19）：加 READ_ONLY_ROLE / RATE_LIMITED。
// 不加的话，viewer 打写端点后端正常返回的 403、限速的 429，会被这层判成「上游不合契约」502——
// 访客看到「上游坏了」，而不是「演示空间只读」。
export const commandErrorCodeSchema = z.enum([
  "INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INVALID_STATE", "FROM_VALUE_CHANGED",
  "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_TIMEOUT", "UPSTREAM_INVALID_RESPONSE", "INTERNAL_ERROR",
  "READ_ONLY_ROLE", "RATE_LIMITED",
])
export const commandErrorSchema = z.object({ ok: z.literal(false), error: z.object({
  code: commandErrorCodeSchema, message: z.string().min(1).max(4096), retryable: z.boolean(), requestId: requestIdSchema,
  // v1.9.19：只在该码明确声明时出现（rerun 撞车的 409 带 details.jobId）；loose 是为了后端多塞一个键不炸整条
  details: z.looseObject({}).optional(),
}).strict() }).strict()
export type CommandErrorCode = z.infer<typeof commandErrorCodeSchema>
export type CommandResponse = ((z.infer<typeof commandSuccessSchema> | PreflightSuccess) & { error?: never }) | z.infer<typeof commandErrorSchema>

export const commandErrorStatus: Record<CommandErrorCode, number> = {
  INVALID_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_STATE: 409, FROM_VALUE_CHANGED: 409,
  SOURCE_UNAVAILABLE: 503, SOURCE_TRUNCATED: 502, UPSTREAM_TIMEOUT: 504, UPSTREAM_INVALID_RESPONSE: 502, INTERNAL_ERROR: 500,
  READ_ONLY_ROLE: 403, RATE_LIMITED: 429,
}
