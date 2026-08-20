import type { Pool } from "pg";

export interface ReconciliationResult {
  rawTotal: number;
  canonicalTotal: number;
  delta: number;
  tolerance: number;
  passed: boolean;
}

export interface CpaOutlier {
  accountId: string;
  realCpa: number;
  assessmentPrice: number;
}

export interface NewDataQualityCheck {
  workspaceId: string;
  ds: string;
  checkType: "total_reconciliation" | "cpa_outlier" | "missing_consecutive_days";
  sample: Record<string, unknown>;
  passed: boolean;
  delta: Record<string, unknown>;
}

function numeric(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Data quality query returned a non-numeric value: ${String(value)}`);
  }
  return parsed;
}

export class DataQualityRepository {
  constructor(private readonly pool: Pool) {}

  async reconcileTotals(workspaceId: string, ds: string): Promise<ReconciliationResult> {
    const result = await this.pool.query<{
      raw_total: string | number;
      canonical_total: string | number;
    }>(
      `WITH latest_raw AS (
         SELECT DISTINCT ON (account_id, resource) account_id, resource, payload
         FROM metrics_raw
         WHERE workspace_id = $1 AND ds = $2::date
           AND resource IN ('account_offline', 'account_realtime')
         ORDER BY account_id, resource, fetched_at DESC, id DESC
       ), source_rows AS (
         SELECT account_id,
                (max(payload::text) FILTER (
                  WHERE resource = 'account_offline'
                ))::jsonb AS offline,
                (max(payload::text) FILTER (
                  WHERE resource = 'account_realtime'
                ))::jsonb AS realtime
         FROM latest_raw
         GROUP BY account_id
       ), scoped_accounts AS (
         SELECT account_id FROM source_rows
         UNION
         SELECT account_id
         FROM account_metrics_daily
         WHERE workspace_id = $1 AND ds = $2::date
       ), raw_total AS (
         SELECT COALESCE(SUM(
           CASE
             WHEN metric.field_sources->>'cost' IN ('realtime', 'gap_filled')
               AND source.realtime->>'account_cost' ~ '^-?[0-9]+([.][0-9]+)?$'
               THEN (source.realtime->>'account_cost')::numeric
             WHEN source.offline->>'cost_api' ~ '^-?[0-9]+([.][0-9]+)?$'
               THEN (source.offline->>'cost_api')::numeric
             WHEN source.realtime->>'account_cost' ~ '^-?[0-9]+([.][0-9]+)?$'
               THEN (source.realtime->>'account_cost')::numeric
             ELSE 0
           END
         ), 0) AS value
         FROM scoped_accounts AS account
         LEFT JOIN source_rows AS source USING (account_id)
         LEFT JOIN account_metrics_daily AS metric
           ON metric.workspace_id = $1
          AND metric.account_id = account.account_id
          AND metric.ds = $2::date
       ), canonical_total AS (
         SELECT COALESCE(SUM(cost), 0) AS value
         FROM account_metrics_daily
         WHERE workspace_id = $1 AND ds = $2::date
       )
       SELECT raw_total.value AS raw_total, canonical_total.value AS canonical_total
       FROM raw_total CROSS JOIN canonical_total`,
      [workspaceId, ds],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Data quality reconciliation did not return a row");
    }
    const rawTotal = numeric(row.raw_total);
    const canonicalTotal = numeric(row.canonical_total);
    const delta = Math.abs(canonicalTotal - rawTotal);
    const tolerance = Math.abs(rawTotal) * 0.001;
    return {
      rawTotal,
      canonicalTotal,
      delta,
      tolerance,
      passed: delta <= tolerance,
    };
  }

  async markCpaOutliers(workspaceId: string, ds: string): Promise<CpaOutlier[]> {
    const result = await this.pool.query<{
      account_id: string;
      real_cpa: string | number;
      assessment_price_snapshot: string | number;
    }>(
      `UPDATE account_metrics_daily
       SET data_anomaly = true
       WHERE workspace_id = $1 AND ds = $2::date
         AND real_cpa IS NOT NULL
         AND assessment_price_snapshot IS NOT NULL
         AND assessment_price_snapshot > 0
         AND real_cpa > assessment_price_snapshot * 5
       RETURNING account_id, real_cpa, assessment_price_snapshot`,
      [workspaceId, ds],
    );
    return result.rows
      .map((row) => ({
        accountId: row.account_id,
        realCpa: numeric(row.real_cpa),
        assessmentPrice: numeric(row.assessment_price_snapshot),
      }))
      .sort((left, right) => left.accountId.localeCompare(right.accountId));
  }

  async findConsecutiveMissingAccounts(workspaceId: string, ds: string): Promise<string[]> {
    const result = await this.pool.query<{ account_id: string }>(
      `SELECT account.account_id
       FROM accounts AS account
       WHERE account.workspace_id = $1
         AND account.status = 'active'
         AND account.lifecycle_stage IS DISTINCT FROM 'closed'
         AND NOT EXISTS (
           SELECT 1 FROM account_metrics_daily AS metric
           WHERE metric.workspace_id = account.workspace_id
             AND metric.account_id = account.account_id
             AND metric.ds = $2::date
         )
         AND NOT EXISTS (
           SELECT 1 FROM account_metrics_daily AS metric
           WHERE metric.workspace_id = account.workspace_id
             AND metric.account_id = account.account_id
             AND metric.ds = $2::date - 1
         )
       ORDER BY account.account_id`,
      [workspaceId, ds],
    );
    return result.rows.map((row) => row.account_id);
  }

  async recordCheck(check: NewDataQualityCheck): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO data_quality_checks (
         workspace_id, ds, check_type, sample, passed, delta, checked_at
       ) VALUES ($1, $2::date, $3, $4::jsonb, $5, $6::jsonb, now())
       RETURNING id`,
      [
        check.workspaceId,
        check.ds,
        check.checkType,
        check.sample,
        check.passed,
        check.delta,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Failed to persist ${check.checkType} for ${check.ds}`);
    }
  }
}
