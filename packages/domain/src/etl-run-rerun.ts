import { z } from "zod";
import { etlRunIdSchema } from "./etl-run-list.js";
import { requestIdSchema, stableDataQueryErrorSchema } from "./data-query-contract.js";

export const ETL_RERUN_CONFLICT_MESSAGE = "该拉数已有一个排队/运行中的重跑";
export const etlRunRerunRequestSchema = z.object({}).strict();
export const etlRunRerunDataSchema = z.object({ jobId: z.string().uuid(), sourceRunId: etlRunIdSchema }).strict();
const error = z.union([
  stableDataQueryErrorSchema.extend({ code: z.enum(["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "READ_ONLY_ROLE",
    "NOT_FOUND", "INVALID_STATE", "UPSTREAM_INVALID_RESPONSE", "SOURCE_TRUNCATED", "SOURCE_UNAVAILABLE", "UPSTREAM_TIMEOUT", "INTERNAL_ERROR"]) }).strict(),
  stableDataQueryErrorSchema.extend({ code: z.literal("CONFLICT"), message: z.literal(ETL_RERUN_CONFLICT_MESSAGE),
    retryable: z.literal(false), details: z.object({ jobId: z.string().uuid() }).strict() }).strict(),
]);
export const etlRunRerunResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: etlRunRerunDataSchema,
    meta: z.object({ requestId: requestIdSchema }).strict() }).strict(),
  z.object({ ok: z.literal(false), error }).strict(),
]);
export type EtlRunRerunData = z.infer<typeof etlRunRerunDataSchema>;
