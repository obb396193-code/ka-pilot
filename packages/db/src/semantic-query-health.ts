import type { Pool } from "pg";

import {
  buildMetricFilter,
  isoTimestamp,
  nullableNumber,
  validateScope,
} from "./semantic-query-support.js";
import type {
  CoverageHealth,
  EtlStatusHealth,
  QualityHealth,
  RawResourceHealth,
  SemanticHealthResult,
  SemanticQueryScope,
} from "./semantic-query-types.js";

interface CoverageMetricRow {
  canonical_rows: string | number;
  accounts_with_canonical: string | number;
}
interface AccountCountRow {
  accounts_in_scope: string | number;
  date_count: string | number;
}

interface RawHealthRow {
  resource: string;
  row_count: string | number;
  latest_fetched_at: string | Date;
}

interface EtlHealthRow {
  status: string;
  run_count: string | number;
  latest_started_at: string | Date | null;
  latest_finished_at: string | Date | null;
}

interface QualityHealthRow {
  passed_checks: string | number;
  failed_checks: string | number;
  unknown_checks: string | number;
  latest_checked_at: string | Date | null;
}

function numberOrThrow(value: string | number, field: string): number {
  const parsed = nullableNumber(value);
  if (parsed === null) {
    throw new Error(`Health query returned invalid ${field}: ${String(value)}`);
  }
  return parsed;
}

function optionalTimestamp(value: string | Date | null): string | null {
  return value === null ? null : isoTimestamp(value);
}

function buildAccountScopeFilter(scope: SemanticQueryScope): {
  whereSql: string;
  values: unknown[];
} {
  const values: unknown[] = [scope.workspaceId, scope.dateFrom, scope.dateTo];
  const conditions = ["account.workspace_id = $1", "account.status = 'active'"];
  const add = (sql: (placeholder: string) => string, value: unknown): void => {
    values.push(value);
    conditions.push(sql(`$${values.length}`));
  };
  if (scope.filters?.accountId) {
    add((placeholder) => `account.account_id = ${placeholder}`, scope.filters.accountId);
  }
  if (scope.filters?.accountScopes) {
    const encoded = new Set<string>();
    for (const scoped of scope.filters.accountScopes) {
      if (scoped.media.trim() === "" || scoped.accountId.trim() === "") {
        throw new Error("accountScopes require media and accountId");
      }
      const key = JSON.stringify([scoped.media, scoped.accountId]);
      if (encoded.has(key)) throw new Error("accountScopes contain a duplicate tuple");
      encoded.add(key);
    }
    if (scope.filters.accountScopes.length === 0) {
      conditions.push("false");
    } else {
      add(
        (placeholder) => `EXISTS (
          SELECT 1
          FROM jsonb_to_recordset(${placeholder}::jsonb)
            AS allowed(media text, account_id text)
          WHERE allowed.media = account.media
            AND allowed.account_id = account.account_id
        )`,
        JSON.stringify(scope.filters.accountScopes.map((account) => ({
          media: account.media,
          account_id: account.accountId,
        }))),
      );
    }
  }
  if (scope.filters?.ownerUserId) {
    add((placeholder) => `account.owner_user_id = ${placeholder}::uuid`, scope.filters.ownerUserId);
  }
  if (scope.filters?.media) {
    add((placeholder) => `account.media = ${placeholder}`, scope.filters.media);
  }
  if (scope.filters?.taskId) {
    add(
      (placeholder) => `EXISTS (
        SELECT 1 FROM task_accounts AS relation
        WHERE relation.workspace_id = account.workspace_id
          AND relation.media = account.media
          AND relation.account_id = account.account_id
          AND relation.task_id = ${placeholder}
          AND relation.valid_from <= $3::date
          AND (relation.valid_to IS NULL OR relation.valid_to >= $2::date)
      )`,
      scope.filters.taskId,
    );
  }
  return { whereSql: conditions.join("\n       AND "), values };
}

async function queryCoverage(pool: Pool, scope: SemanticQueryScope): Promise<CoverageHealth> {
  const metricFilter = buildMetricFilter(scope);
  const metricResult = await pool.query<CoverageMetricRow>(
    `SELECT count(*)::text AS canonical_rows,
            count(DISTINCT (metric.media, metric.account_id))::text AS accounts_with_canonical
     FROM account_metrics_daily AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.media = metric.media
      AND account.account_id = metric.account_id
     WHERE ${metricFilter.whereSql}`,
    metricFilter.values,
  );
  const accountFilter = buildAccountScopeFilter(scope);
  const accountResult = await pool.query<AccountCountRow>(
    `SELECT count(*)::text AS accounts_in_scope,
            ($3::date - $2::date + 1)::text AS date_count
     FROM accounts AS account
     WHERE ${accountFilter.whereSql}`,
    accountFilter.values,
  );
  const metric = metricResult.rows[0]!;
  const account = accountResult.rows[0]!;
  const canonicalRows = numberOrThrow(metric.canonical_rows, "canonical_rows");
  const accountsInScope = numberOrThrow(account.accounts_in_scope, "accounts_in_scope");
  const dateCount = numberOrThrow(account.date_count, "date_count");
  const expectedAccountDays = accountsInScope * dateCount;
  return {
    canonicalRows,
    accountsInScope,
    accountsWithCanonical: numberOrThrow(
      metric.accounts_with_canonical,
      "accounts_with_canonical",
    ),
    dateCount,
    expectedAccountDays,
    missingAccountDays: Math.max(expectedAccountDays - canonicalRows, 0),
  };
}

async function queryRawHealth(
  pool: Pool,
  scope: SemanticQueryScope,
): Promise<RawResourceHealth[]> {
  const filter = buildMetricFilter(scope);
  const result = await pool.query<RawHealthRow>(
    `SELECT metric.resource, count(*)::text AS row_count,
            max(metric.fetched_at) AS latest_fetched_at
     FROM metrics_raw AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.media = metric.media
      AND account.account_id = metric.account_id
     WHERE ${filter.whereSql}
     GROUP BY metric.resource
     ORDER BY metric.resource`,
    filter.values,
  );
  return result.rows.map((row) => ({
    resource: row.resource,
    rowCount: numberOrThrow(row.row_count, "raw row_count"),
    latestFetchedAt: isoTimestamp(row.latest_fetched_at),
  }));
}

async function queryEtlHealth(
  pool: Pool,
  scope: SemanticQueryScope,
): Promise<EtlStatusHealth[]> {
  const result = await pool.query<EtlHealthRow>(
    `SELECT COALESCE(status, 'unknown') AS status, count(*)::text AS run_count,
            max(started_at) AS latest_started_at,
            max(finished_at) AS latest_finished_at
     FROM etl_runs
     WHERE workspace_id = $1
       AND COALESCE(started_at, finished_at)::date BETWEEN $2::date AND $3::date
     GROUP BY COALESCE(status, 'unknown')
     ORDER BY COALESCE(status, 'unknown')`,
    [scope.workspaceId, scope.dateFrom, scope.dateTo],
  );
  return result.rows.map((row) => ({
    status: row.status,
    runCount: numberOrThrow(row.run_count, "ETL run_count"),
    latestStartedAt: optionalTimestamp(row.latest_started_at),
    latestFinishedAt: optionalTimestamp(row.latest_finished_at),
  }));
}

async function queryQualityHealth(pool: Pool, scope: SemanticQueryScope): Promise<QualityHealth> {
  const result = await pool.query<QualityHealthRow>(
    `SELECT count(*) FILTER (WHERE passed IS TRUE)::text AS passed_checks,
            count(*) FILTER (WHERE passed IS FALSE)::text AS failed_checks,
            count(*) FILTER (WHERE passed IS NULL)::text AS unknown_checks,
            max(checked_at) AS latest_checked_at
     FROM data_quality_checks
     WHERE workspace_id = $1 AND ds BETWEEN $2::date AND $3::date`,
    [scope.workspaceId, scope.dateFrom, scope.dateTo],
  );
  const row = result.rows[0]!;
  return {
    passedChecks: numberOrThrow(row.passed_checks, "passed_checks"),
    failedChecks: numberOrThrow(row.failed_checks, "failed_checks"),
    unknownChecks: numberOrThrow(row.unknown_checks, "unknown_checks"),
    latestCheckedAt: optionalTimestamp(row.latest_checked_at),
  };
}

export async function querySemanticHealth(
  pool: Pool,
  scope: SemanticQueryScope,
): Promise<SemanticHealthResult> {
  validateScope(scope);
  const [coverage, rawResources, etlStatuses, quality] = await Promise.all([
    queryCoverage(pool, scope),
    queryRawHealth(pool, scope),
    queryEtlHealth(pool, scope),
    queryQualityHealth(pool, scope),
  ]);
  return { coverage, rawResources, etlStatuses, quality };
}
