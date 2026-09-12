import { accountHourlyParamsSchema, approvedWorkspaceAuthContextSchema, calendarDateSchema } from "@ka/domain";
import type { Pool } from "pg";
import { accountScopeClause, accountScopeParams } from "./r014/workspace-authority.js";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";

export class AccountHourlyReadError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "SOURCE_UNAVAILABLE" | "SOURCE_TRUNCATED" |
    "UPSTREAM_INVALID_RESPONSE" | "UPSTREAM_TIMEOUT" | "AMBIGUOUS_VERSION") { super(`Account hourly read: ${code}`); }
}
export interface AccountHourlyReadRow {
  workspaceId: string; media: string; accountId: string; ds: string; hh: number;
  cost: number | null; exposure: number | null; click: number | null; conversion: number | null;
  realConversion: number | null; budget: number | null;
  lastSyncTime: string; sampledAt: string; complete: boolean; sourceRunId: string | null;
}
export interface AccountHourlyReadSnapshot {
  workspaceId: string; date: string; rows: AccountHourlyReadRow[];
  coefficient: { id: string; value: number; op: "multiply" | "divide"; effectiveDate: string } | null;
  /**
   * v1.9.39：**这一整天**在采样表里有过至少一行的账户（不限所请求的小时段）。
   *
   * 「还没采到」与「采过了，就是没有」在页面上长得一样，但一个该等、一个该查。
   * 这个事实**必须按整日单独问**：拿 `rows` 反推只能说明「所请求的这几个小时里没有」，
   * 窗口选 0–10 点而账户 20 点才开始投放时，反推会把一个正常的账户说成没采到。
   */
  sampledAccounts: { media: string; accountId: string }[];
}
const MAX_ROWS = 10000, MAX_BYTES = 16 * 1024 * 1024;
const rowSql = `/* hourly-read-rows */
  SELECT h.workspace_id,h.media,
    CASE WHEN octet_length(h.account_id)<=128 THEN h.account_id END AS account_id,
    h.ds::text,h.hh,h.exposure::text,h.click::text,h.conversion::text,h.real_conversion::text,
    CASE WHEN h.cost IS NULL THEN NULL WHEN octet_length(h.cost::text)<=128 THEN h.cost::text ELSE 'invalid' END AS cost,
    CASE WHEN h.budget IS NULL THEN NULL WHEN octet_length(h.budget::text)<=128 THEN h.budget::text ELSE 'invalid' END AS budget,
    h.last_sync_time,h.sampled_at,h.complete,h.source_run_id::text,COUNT(*) OVER()::text AS total_count
  FROM account_metrics_hourly h
  WHERE h.workspace_id=$1 AND h.media=$2 AND h.ds=$3 AND h.hh BETWEEN $4 AND $5
    AND ${accountScopeClause("$6", "$7", "h.media", "h.account_id")}
  ORDER BY h.media COLLATE "C",h.account_id COLLATE "C",h.hh LIMIT 10001`;
/**
 * v1.9.39：整日采样存在性。只问「有没有」，不取任何指标——所以是 `GROUP BY` 不是取行。
 * 列一律带 `h.` 前缀：不带前缀的裸列名在 PG 的名字解析下会先命中作用域子查询自己那一层，
 * 把授权谓词退化成恒真（A38）。
 */
const sampledSql = `/* hourly-read-sampled-accounts */
  SELECT h.media, CASE WHEN octet_length(h.account_id)<=128 THEN h.account_id END AS account_id
  FROM account_metrics_hourly h
  WHERE h.workspace_id=$1 AND h.media=$2 AND h.ds=$3
    AND ${accountScopeClause("$4", "$5", "h.media", "h.account_id")}
  GROUP BY h.media, h.account_id
  ORDER BY h.media COLLATE "C", h.account_id COLLATE "C" LIMIT 1001`;
const coefficientSql = `/* hourly-read-coefficient */
  SELECT id::text,workspace_id,media,effective_date::text,op,
    CASE WHEN octet_length(coefficient::text)<=128 THEN coefficient::text ELSE 'invalid' END AS coefficient
  FROM channel_coefficients c WHERE workspace_id=$1 AND media=$2 AND effective_date=(
    SELECT max(effective_date) FROM channel_coefficients WHERE workspace_id=$1 AND media=$2 AND effective_date<=$3)
  ORDER BY id LIMIT 2`;
function invalid(): never { throw new AccountHourlyReadError("UPSTREAM_INVALID_RESPONSE"); }
function numberValue(value: unknown, integer = false): number | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 128 || !/^\d+(?:\.\d+)?$/.test(value)) invalid();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(parsed))) invalid();
  return parsed;
}
function runId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) invalid();
  return value;
}
function timestamp(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value.toISOString();
}

/** Internal snapshot only, not the public SourceQueryResult. Auth must come from
 * the server's live Session resolver; no identity is accepted from query params.
 * Absent storage is unavailable. Does not infer coverage/freshness from row count,
 * fill missing hours, fold hh24 into hh23, or consult daily/ad/Raw data.
 */
export class AccountHourlyReadRepository {
  private readonly maxBytes: number;
  constructor(private readonly pool: Pool, options: { maxResponseBytes?: number } = {}) {
    const max = options.maxResponseBytes ?? MAX_BYTES;
    if (!Number.isSafeInteger(max) || max < 1 || max > MAX_BYTES) throw new AccountHourlyReadError("INVALID_REQUEST");
    this.maxBytes = max; // Trusted process option can only tighten the 16MiB ceiling.
  }
  async read(rawAuth: unknown, rawRequest: unknown): Promise<AccountHourlyReadSnapshot> {
    const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!auth.success || auth.data.workspaceKind !== "personal") throw new AccountHourlyReadError("FORBIDDEN");
    const requested = accountHourlyParamsSchema.safeParse(rawRequest);
    // Selection belongs to the already-filtered approved context, not a second
    // request account list. Public optional hours must be resolved by the caller.
    if (!requested.success || requested.data.accountIds !== undefined || requested.data.hhFrom === undefined || requested.data.hhTo === undefined)
      throw new AccountHourlyReadError("INVALID_REQUEST");
    const input = requested.data, workspaceId = auth.data.workspaceId;
    const allKeys = auth.data.scope.accounts.map(row => JSON.stringify([row.media, row.accountId]));
    if (new Set(allKeys).size !== allKeys.length) throw new AccountHourlyReadError("FORBIDDEN");
    const ids = new Set(auth.data.scope.accounts.filter(row => row.media === input.media).map(row => row.accountId));
    const empty: AccountHourlyReadSnapshot = { workspaceId, date: input.date, rows: [], coefficient: null, sampledAccounts: [] };
    if (ids.size === 0) return this.bounded(empty);
    const scope = accountScopeParams(auth.data), from = Math.max(0, requested.data.hhFrom - 1), to = Math.min(23, requested.data.hhTo);
    try {
      return await withSemanticReadSnapshot(this.pool, async client => {
        const table = await client.query("SELECT to_regclass('account_metrics_hourly') IS NOT NULL AS available");
        if (table.rows.length !== 1 || table.rows[0]?.available !== true) throw new AccountHourlyReadError("SOURCE_UNAVAILABLE");
        const { rows } = await client.query(rowSql, [workspaceId, input.media, input.date, from, to, scope.kind, scope.allowed]);
        if (rows.length > MAX_ROWS) throw new AccountHourlyReadError("SOURCE_TRUNCATED");
        const result: AccountHourlyReadSnapshot = { ...empty, rows: [], sampledAccounts: [] }, seen = new Set<string>();
        // 整日采样存在性：先问，再取窗口内的行。没有这一步就分不清「还没采」和「采过没有」。
        const sampled = await client.query(sampledSql, [workspaceId, input.media, input.date, scope.kind, scope.allowed]);
        if (sampled.rows.length > 1000) throw new AccountHourlyReadError("SOURCE_TRUNCATED");
        for (const row of sampled.rows) {
          if (row.media !== input.media || typeof row.account_id !== "string" || !ids.has(row.account_id)) {
            throw new AccountHourlyReadError("FORBIDDEN");
          }
          result.sampledAccounts.push({ media: row.media, accountId: row.account_id });
        }
        for (const row of rows) {
          if (typeof row.total_count !== "string" || !/^\d{1,18}$/.test(row.total_count)) invalid();
          if (BigInt(row.total_count) > BigInt(MAX_ROWS)) throw new AccountHourlyReadError("SOURCE_TRUNCATED");
          if (Number(row.total_count) !== rows.length) invalid();
          if (row.workspace_id !== workspaceId || row.media !== input.media || !ids.has(row.account_id)) throw new AccountHourlyReadError("FORBIDDEN");
          if (!calendarDateSchema.safeParse(row.ds).success || row.ds !== input.date || !Number.isInteger(row.hh) || row.hh < from || row.hh > to ||
            typeof row.complete !== "boolean") invalid();
          const key = JSON.stringify([row.account_id, row.hh]); if (seen.has(key)) invalid(); seen.add(key);
          result.rows.push({ workspaceId, media: row.media, accountId: row.account_id, ds: row.ds, hh: row.hh,
            cost: numberValue(row.cost), exposure: numberValue(row.exposure, true), click: numberValue(row.click, true),
            conversion: numberValue(row.conversion, true), realConversion: numberValue(row.real_conversion, true),
            budget: numberValue(row.budget), lastSyncTime: timestamp(row.last_sync_time), sampledAt: timestamp(row.sampled_at),
            complete: row.complete, sourceRunId: runId(row.source_run_id) });
        }
        if (result.rows.length > 0) {
          const coefficients = await client.query(coefficientSql, [workspaceId, input.media, input.date]);
          if (coefficients.rows.length > 1) throw new AccountHourlyReadError("AMBIGUOUS_VERSION");
          const row = coefficients.rows[0];
          if (row) {
            const id = runId(row.id), value = numberValue(row.coefficient);
            if (!id || value === null || value <= 0 || row.workspace_id !== workspaceId || row.media !== input.media ||
              !calendarDateSchema.safeParse(row.effective_date).success || row.effective_date > input.date || (row.op !== "multiply" && row.op !== "divide")) invalid();
            result.coefficient = { id, value, op: row.op, effectiveDate: row.effective_date };
          }
        }
        return this.bounded(result);
      });
    } catch (error) {
      if (error instanceof AccountHourlyReadError) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "57014") throw new AccountHourlyReadError("UPSTREAM_TIMEOUT");
      throw new AccountHourlyReadError("SOURCE_UNAVAILABLE");
    }
  }
  private bounded(result: AccountHourlyReadSnapshot): AccountHourlyReadSnapshot {
    let bytes = Buffer.byteLength(JSON.stringify({ ...result, rows: [] }));
    for (let index = 0; index < result.rows.length; index++) {
      bytes += Buffer.byteLength(JSON.stringify(result.rows[index])) + (index === 0 ? 0 : 1);
      if (bytes >= this.maxBytes) throw new AccountHourlyReadError("SOURCE_TRUNCATED");
    }
    if (bytes >= this.maxBytes) throw new AccountHourlyReadError("SOURCE_TRUNCATED");
    return result;
  }
}
