import { z } from "zod"
import { requestIdSchema } from "./contracts.ts"

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
export const commandErrorCodeSchema = z.enum([
  "INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INVALID_STATE", "FROM_VALUE_CHANGED",
  "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_TIMEOUT", "UPSTREAM_INVALID_RESPONSE", "INTERNAL_ERROR",
])
export const commandErrorSchema = z.object({ ok: z.literal(false), error: z.object({
  code: commandErrorCodeSchema, message: z.string().min(1).max(4096), retryable: z.boolean(), requestId: requestIdSchema,
}).strict() }).strict()
export type CommandErrorCode = z.infer<typeof commandErrorCodeSchema>
export type CommandResponse = (z.infer<typeof commandSuccessSchema> & { error?: never }) | z.infer<typeof commandErrorSchema>

export const commandErrorStatus: Record<CommandErrorCode, number> = {
  INVALID_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_STATE: 409, FROM_VALUE_CHANGED: 409,
  SOURCE_UNAVAILABLE: 503, SOURCE_TRUNCATED: 502, UPSTREAM_TIMEOUT: 504, UPSTREAM_INVALID_RESPONSE: 502, INTERNAL_ERROR: 500,
}
