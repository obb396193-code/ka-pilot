import { z } from "zod";
import { calendarDateSchema } from "./data-query-base-rows.js";
import { etlBatchAccountIdsSchema, etlBatchMediaSchema } from "./etl-batch-failure.js";
import { normalizeAccountHourlySample } from "./account-hourly-sample.js";

const timestamp = z.iso.datetime({ offset: true }).refine(value =>
  calendarDateSchema.safeParse(value.slice(0, 10)).success && Number.isFinite(Date.parse(value)));
const runId = z.string().regex(/^[1-9][0-9]{0,18}$/).refine(id => id.length < 19 || id <= "9223372036854775807");
const metric = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
export const accountHourlyStoredRowSchema = z.object({
  workspaceId: z.string().uuid(), media: etlBatchMediaSchema, accountId: z.string().min(1).max(256),
  ds: calendarDateSchema, hh: z.number().int().min(0).max(23),
  cost: metric, exposure: count, click: count, conversion: count, realConversion: count, budget: metric,
  lastSyncTime: timestamp, sampledAt: timestamp, complete: z.boolean(), sourceRunId: runId,
}).strict();
export type AccountHourlyStoredRow = z.infer<typeof accountHourlyStoredRowSchema>;

/** Private typed batch, not a browser request or a substitute for live job fencing. */
export const accountHourlyStorageBatchSchema = z.object({
  workspaceId: z.string().uuid(), jobId: z.string().uuid(), leaseToken: z.string().uuid(), runId,
  media: etlBatchMediaSchema, accountIds: etlBatchAccountIdsSchema.refine(ids => ids.length <= 50),
  ds: calendarDateSchema, hh: z.number().int().min(0).max(23), sampledAt: timestamp,
  sourceUtcOffset: z.string().regex(/^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/),
  rows: z.array(accountHourlyStoredRowSchema).max(50), rawRows: z.array(z.record(z.string(), z.unknown())).max(50),
}).strict().superRefine((input, ctx) => {
  const bad = () => ctx.addIssue({ code: "custom", message: "Invalid hourly storage batch" });
  const sampled = Date.parse(input.sampledAt);
  const end = Date.parse(`${input.ds}T00:00:00${input.sourceUtcOffset}`) + (input.hh + 1) * 3_600_000 + 300_000;
  const seen = new Set<string>();
  for (const row of input.rows) {
    if (row.workspaceId !== input.workspaceId || row.media !== input.media || row.ds !== input.ds || row.hh !== input.hh ||
        row.sourceRunId !== input.runId || Date.parse(row.sampledAt) !== sampled || row.complete !== (sampled >= end) ||
        !input.accountIds.includes(row.accountId) || seen.has(row.accountId)) bad();
    seen.add(row.accountId);
  }
  const rawSeen = new Set<string>();
  for (const row of input.rawRows) {
    const id = typeof row.account_id === "number" && Number.isSafeInteger(row.account_id) && row.account_id >= 0
      ? String(row.account_id) : row.account_id;
    const day = typeof row.ds === "string" ? row.ds.replaceAll("-", "") : null;
    if (typeof id !== "string" || !seen.has(id) || rawSeen.has(id) || day !== input.ds.replaceAll("-", "") ||
        (row.media !== undefined && row.media !== input.media)) bad();
    if (typeof id === "string") rawSeen.add(id);
  }
  if (rawSeen.size !== seen.size || input.rawRows.length !== input.rows.length) bad();
  try {
    const expected = normalizeAccountHourlySample({ workspaceId: input.workspaceId, media: input.media,
      accountIds: input.accountIds, ds: input.ds, hh: input.hh, sampledAt: input.sampledAt,
      sourceUtcOffset: input.sourceUtcOffset, sourceRunId: input.runId, rows: input.rawRows });
    const byId = new Map(expected.rows.map(row => [row.accountId, row]));
    for (const row of input.rows) {
      const source = byId.get(row.accountId);
      if (!source || ["cost", "exposure", "click", "conversion", "realConversion", "budget"].some(key =>
        source[key as keyof AccountHourlyStoredRow] !== row[key as keyof AccountHourlyStoredRow]) ||
        Date.parse(source.lastSyncTime) !== Date.parse(row.lastSyncTime)) bad();
    }
  } catch { bad(); }
});
export type AccountHourlyStorageBatch = z.infer<typeof accountHourlyStorageBatchSchema>;
