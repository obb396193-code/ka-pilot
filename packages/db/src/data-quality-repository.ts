import type { Pool } from "pg";
import { RECONCILE_TOTALS_SQL } from "./data-quality-reconciliation.js";
import { nullableNumber, SemanticQueryContractError } from "./semantic-query-support.js";

export interface ReconciliationResult {
  rawTotal: number | null;
  canonicalTotal: number | null;
  delta: number | null;
  tolerance: number | null;
  passed: boolean | null;
}

export interface CpaOutlier {
  media: string;
  accountId: string;
  realCpa: number;
  assessmentPrice: number;
}

export interface MissingAccount {
  media: string;
  accountId: string;
}

export interface NewDataQualityCheck {
  workspaceId: string;
  ds: string;
  checkType: "total_reconciliation" | "cpa_outlier" | "missing_consecutive_days";
  sample: Record<string, unknown>;
  passed: boolean | null;
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
      raw_total: string | number | null;
      canonical_total: string | number | null;
      invalid: boolean | null;
    }>(RECONCILE_TOTALS_SQL, [workspaceId, ds]).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error &&
        (error.code === "22003" || error.code === "22P02")) {
        throw new SemanticQueryContractError();
      }
      throw error;
    });
    const row = result.rows[0];
    if (!row) throw new SemanticQueryContractError();
    if (row.invalid) throw new SemanticQueryContractError();
    const rawTotal = nullableNumber(row.raw_total);
    const canonicalTotal = nullableNumber(row.canonical_total);
    if (rawTotal === null || canonicalTotal === null) {
      return { rawTotal, canonicalTotal, delta: null, tolerance: null, passed: null };
    }
    const delta = Math.abs(canonicalTotal - rawTotal);
    const tolerance = Math.abs(rawTotal) * 0.001;
    if (!Number.isFinite(delta) || !Number.isFinite(tolerance)) throw new SemanticQueryContractError();
    return { rawTotal, canonicalTotal, delta, tolerance, passed: delta <= tolerance };
  }

  async markCpaOutliers(workspaceId: string, ds: string): Promise<CpaOutlier[]> {
    const result = await this.pool.query<{
      media: string;
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
       RETURNING media, account_id, real_cpa, assessment_price_snapshot`,
      [workspaceId, ds],
    );
    return result.rows
      .map((row) => ({
        media: row.media,
        accountId: row.account_id,
        realCpa: numeric(row.real_cpa),
        assessmentPrice: numeric(row.assessment_price_snapshot),
      }))
      .sort((left, right) => left.accountId.localeCompare(right.accountId));
  }

  async findConsecutiveMissingAccounts(workspaceId: string, ds: string): Promise<MissingAccount[]> {
    const result = await this.pool.query<{ media: string; account_id: string }>(
      `SELECT account.media, account.account_id
       FROM accounts AS account
       WHERE account.workspace_id = $1
         AND account.status = 'active'
         AND account.lifecycle_stage IS DISTINCT FROM 'closed'
         AND NOT EXISTS (
           SELECT 1 FROM account_metrics_daily AS metric
           WHERE metric.workspace_id = account.workspace_id
             AND metric.media = account.media
             AND metric.account_id = account.account_id
             AND metric.ds = $2::date
         )
         AND NOT EXISTS (
           SELECT 1 FROM account_metrics_daily AS metric
           WHERE metric.workspace_id = account.workspace_id
             AND metric.media = account.media
             AND metric.account_id = account.account_id
             AND metric.ds = $2::date - 1
         )
       ORDER BY account.media, account.account_id`,
      [workspaceId, ds],
    );
    return result.rows.map((row) => ({ media: row.media, accountId: row.account_id }));
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
