import { z } from "zod";
import { calendarDateSchema } from "./data-query-base-rows.js";
import { etlBatchAccountIdsSchema, etlBatchMediaSchema } from "./etl-batch-failure.js";
import type { AccountHourlyStoredRow } from "./account-hourly-storage.js";

const dateSchema = z.string().regex(/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/)
  .transform(value => value.length === 8 ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value)
  .pipe(calendarDateSchema);
const timestampSchema = z.iso.datetime({ offset: true }).refine(value =>
  calendarDateSchema.safeParse(value.slice(0, 10)).success && Number.isFinite(Date.parse(value)));
const contextSchema = z.object({
  workspaceId: z.string().uuid(), media: etlBatchMediaSchema, accountIds: etlBatchAccountIdsSchema,
  ds: dateSchema, hh: z.number().int().min(0).max(23), sampledAt: timestampSchema,
  // Required source metadata, never the machine's timezone or a browser parameter.
  sourceUtcOffset: z.string().regex(/^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/),
  sourceRunId: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => value.length < 19 || value <= "9223372036854775807"),
  rows: z.array(z.unknown()).max(10000),
}).strict();

export type AccountHourlySampleRecord = AccountHourlyStoredRow;

function invalid(): never { throw new Error("Invalid account hourly sample"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function accountId(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) invalid();
    return String(value);
  }
  if (typeof value !== "string" || !value || value.length > 256 || value !== value.trim() || /\p{Cc}/u.test(value)) invalid();
  return value;
}
function numeric(value: unknown, integer = false): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" && (typeof value !== "string" || value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value))) invalid();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(parsed))) invalid();
  return parsed;
}
function sourceTimestamp(value: unknown, utcOffset: string): string {
  if (typeof value !== "string") invalid();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}${utcOffset}` : value;
  return new Date(timestampSchema.parse(normalized)).toISOString();
}

/** Pure boundary only. Does not authorize a request, persist data, derive cash
 * metrics, or assert source freshness. `complete` is the frozen sampling-time
 * predicate, independent of lastSyncTime. Missing rows remain missing.
 */
export function normalizeAccountHourlySample(raw: unknown): {
  rows: readonly AccountHourlySampleRecord[];
  missingAccountIds: readonly string[];
} {
  try {
    const inputRecord = record(raw);
    if (!Array.isArray(inputRecord.rows) || inputRecord.rows.length > 10000) invalid();
    const input = contextSchema.parse(inputRecord);
    const allowed = new Set(input.accountIds), seen = new Set<string>();
    const sampledAt = new Date(input.sampledAt).toISOString();
    const hourEnd = Date.parse(`${input.ds}T00:00:00${input.sourceUtcOffset}`) + (input.hh + 1) * 3_600_000;
    const complete = Date.parse(sampledAt) >= hourEnd + 300_000;
    const rows = input.rows.map(value => {
      const source = record(value), id = accountId(source.account_id);
      if (!allowed.has(id) || seen.has(id) || dateSchema.parse(source.ds) !== input.ds ||
        (source.media !== undefined && source.media !== input.media)) invalid();
      seen.add(id);
      return Object.freeze({
        workspaceId: input.workspaceId, media: input.media, accountId: id, ds: input.ds, hh: input.hh,
        cost: numeric(source.account_cost), exposure: numeric(source.account_exposure, true),
        click: numeric(source.account_click, true), conversion: numeric(source.account_conversion, true),
        realConversion: numeric(source.account_real_conversion, true), budget: numeric(source.account_budget),
        lastSyncTime: sourceTimestamp(source.last_sync_time, input.sourceUtcOffset), sampledAt, complete,
        sourceRunId: input.sourceRunId,
      });
    });
    rows.sort((left, right) => left.accountId < right.accountId ? -1 : left.accountId > right.accountId ? 1 : 0);
    return Object.freeze({ rows: Object.freeze(rows), missingAccountIds: Object.freeze(input.accountIds.filter(id => !seen.has(id)).sort()) });
  } catch { return invalid(); } // Do not leak upstream payload or trusted identity via Zod errors.
}
