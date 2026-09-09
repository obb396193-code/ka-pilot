import { z } from "zod";
import { calendarDateSchema } from "./data-query-base-rows.js";
import { requestIdSchema, stableDataQueryErrorSchema } from "./data-query-contract.js";
import { etlBatchFailureWarningSchema } from "./etl-batch-failure.js";

const timestamp = z.string().datetime({ offset: true })
  .refine(value => calendarDateSchema.safeParse(value.slice(0, 10)).success);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Frozen attempt identity: do not coerce BIGSERIAL into a JS number. */
export const etlRunIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/)
  .refine(value => value.length < 19 || value <= "9223372036854775807");

/** Only approved public warnings; private failure evidence/error bodies are not this DTO. */
export const etlRunWarningSchema = z.union([z.literal("BLOCKED_AUTH"), etlBatchFailureWarningSchema]);

export const etlRunListRowSchema = z.object({
  runId: etlRunIdSchema,
  jobId: z.string().uuid(),
  attempt: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  jobType: z.enum(["etl_full", "etl_incr", "backfill_historical", "backfill_day", "canonical_merge", "data_quality_check"]),
  status: z.enum(["running", "done", "failed"]),
  businessDate: calendarDateSchema,
  startedAt: timestamp,
  finishedAt: timestamp.nullable(),
  // No stage inference or coercion here. Missing evidence stays null.
  rows: z.object({ raw: count, canonical: count }).strict().nullable(),
  warnings: z.array(etlRunWarningSchema).max(10_000),
  failedStage: z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
}).strict().refine(row => row.finishedAt === null
  ? row.status === "running"
  : row.status !== "running" && Date.parse(row.finishedAt) >= Date.parse(row.startedAt), "Inconsistent run lifecycle")
  .refine(row => row.failedStage === undefined || row.status === "failed", "Failed stage requires failed run");

/** Defensive response cap, not a pagination contract or completeness claim. */
export const etlRunListDataSchema = z.object({ items: z.array(etlRunListRowSchema).max(10_000) }).strict()
  .refine(data => new Set(data.items.map(row => row.runId)).size === data.items.length, "Duplicate run ID");

export const etlRunListResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: etlRunListDataSchema,
    meta: z.object({ requestId: requestIdSchema, dataAsOf: timestamp.nullable(), businessDate: calendarDateSchema,
      workspaceKind: z.enum(["personal", "team"]), selectedSource: z.literal("platform") }).strict(),
  }).strict(),
  z.object({ ok: z.literal(false), error: stableDataQueryErrorSchema }).strict(),
]);

export type EtlRunListRow = z.infer<typeof etlRunListRowSchema>;
export type EtlRunListData = z.infer<typeof etlRunListDataSchema>;
export type EtlRunListResponse = z.infer<typeof etlRunListResponseSchema>;
