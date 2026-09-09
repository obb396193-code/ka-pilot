import { approvedWorkspaceAuthContextSchema, calendarDateSchema } from "@ka/domain";
import type { QueryResult, QueryResultRow } from "pg";
import { accountScopeClause, accountScopeParams } from "./r014/workspace-authority.js";

export interface PlatformHealthClient {
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
  release(): void;
}
export interface PlatformHealthPool { connect(): Promise<PlatformHealthClient> }

/** Internal observation only. Coverage and computed_at do not prove freshness,
 * initial-full readiness, source completeness, or connector/executor health. */
export interface PlatformHealthObservation {
  businessDate: string;
  coverage: { accounts: number; withData: number };
  missingSyncTime: number;
  dataAsOf: string | null;
}
export class PlatformHealthContractError extends Error {
  constructor() { super("Invalid platform health observation"); this.name = "PlatformHealthContractError"; }
}

const COVERAGE_SQL = `/* platform-health-coverage */
WITH candidates AS (
  SELECT account.media, account.account_id
  FROM accounts AS account
  WHERE account.workspace_id = $1::uuid
  UNION
  -- Retain approved accounts absent from the master as missing observations.
  SELECT approved.media, approved.account_id
  FROM jsonb_to_recordset($4::jsonb) AS approved(media text, account_id text)
), visible_accounts AS (
  SELECT candidate.media, candidate.account_id
  FROM candidates AS candidate
  WHERE ${accountScopeClause("$3", "$4", "candidate.media", "candidate.account_id")}
)
SELECT count(*)::text AS accounts,
       count(metric.account_id)::text AS with_data,
       count(*) FILTER (WHERE metric.account_id IS NOT NULL AND metric.computed_at IS NULL)::text AS missing_sync_time,
       max(metric.computed_at) AS data_as_of
FROM visible_accounts AS account
LEFT JOIN account_metrics_daily AS metric
  ON metric.workspace_id = $1::uuid
 AND metric.media = account.media AND metric.account_id = account.account_id
 AND metric.ds = $2::date`;

function count(value: unknown): number {
  if (!(typeof value === "number" || (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)))) {
    throw new PlatformHealthContractError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new PlatformHealthContractError();
  return parsed;
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (!(value instanceof Date || (typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)))) {
    throw new PlatformHealthContractError();
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw new PlatformHealthContractError();
  if (typeof value === "string" && !calendarDateSchema.safeParse(value.slice(0, 10)).success) {
    throw new PlatformHealthContractError();
  }
  return parsed.toISOString();
}

export class PlatformHealthRepository {
  constructor(private readonly pool: PlatformHealthPool) {}

  /** auth must come from server session resolution, never a request body. */
  async read(authInput: unknown, dateInput: unknown): Promise<PlatformHealthObservation> {
    const auth = approvedWorkspaceAuthContextSchema.parse(authInput);
    const businessDate = calendarDateSchema.parse(dateInput);
    const accounts = auth.workspaceKind === "personal"
      ? auth.scope.accounts.map(({ media, accountId }) => ({ media, account_id: accountId })) : [];
    if (new Set(accounts.map(a => JSON.stringify([a.media, a.account_id]))).size !== accounts.length) {
      throw new PlatformHealthContractError();
    }
    const scope = accountScopeParams(auth);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await client.query(COVERAGE_SQL, [auth.workspaceId, businessDate, scope.kind, scope.allowed]);
      if (result.rows.length !== 1) throw new PlatformHealthContractError();
      const row = result.rows[0]!;
      const total = count(row.accounts), withData = count(row.with_data), missingSyncTime = count(row.missing_sync_time);
      const dataAsOf = timestamp(row.data_as_of);
      if (withData > total || missingSyncTime > withData ||
        ((withData - missingSyncTime === 0) !== (dataAsOf === null)) ||
        (auth.workspaceKind === "personal" && total !== accounts.length)) {
        throw new PlatformHealthContractError();
      }
      await client.query("COMMIT");
      return { businessDate, coverage: { accounts: total, withData }, missingSyncTime, dataAsOf };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  }
}
