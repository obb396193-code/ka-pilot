import type { Pool } from "pg";

export interface EffectiveMetricSettings {
  channelCoefficient: number | null;
  assessmentPrice: number | null;
}

export interface CanonicalMetricRecord {
  workspaceId: string;
  accountId: string;
  ds: string;
  cost: number | null;
  exposure: number | null;
  click: number | null;
  conversion: number | null;
  realConversion: number | null;
  realCpa: number | null;
  cashCost: number | null;
  cashCpa: number | null;
  costSpace: number | null;
  gap: number | null;
  budget: number | null;
  budgetUsageRate: number | null;
  deductionRate: number | null;
  mainAdCostProportion: number | null;
  assessmentPriceSnapshot: number | null;
  wakeUv: number | null;
  potentialUv: number | null;
  fieldSources: Record<string, unknown>;
  dataAnomaly: boolean;
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class MetricsRepository {
  constructor(private readonly pool: Pool) {}

  async loadEffectiveSettings(
    workspaceId: string,
    accountId: string,
    ds: string,
  ): Promise<EffectiveMetricSettings> {
    const result = await this.pool.query<{
      coefficient: string | number | null;
      assessment_price: string | number | null;
    }>(
      `SELECT coefficient.coefficient, assessment.price AS assessment_price
       FROM accounts AS account
       LEFT JOIN LATERAL (
         SELECT value.coefficient
         FROM channel_coefficients AS value
         WHERE value.workspace_id = account.workspace_id
           AND value.media = account.media
           AND value.effective_date <= $3::date
         ORDER BY value.effective_date DESC, value.id DESC
         LIMIT 1
       ) AS coefficient ON true
       LEFT JOIN LATERAL (
         SELECT price.price
         FROM task_accounts AS relation
         JOIN assessment_price_history AS price
           ON price.workspace_id = relation.workspace_id
          AND price.task_id = relation.task_id
          AND price.effective_date <= $3::date
         WHERE relation.workspace_id = account.workspace_id
           AND relation.account_id = account.account_id
           AND relation.valid_from <= $3::date
           AND (relation.valid_to IS NULL OR relation.valid_to >= $3::date)
         ORDER BY relation.valid_from DESC, price.effective_date DESC, price.id DESC
         LIMIT 1
       ) AS assessment ON true
       WHERE account.workspace_id = $1 AND account.account_id = $2`,
      [workspaceId, accountId, ds],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Account ${accountId} does not belong to workspace ${workspaceId}`);
    }
    return {
      channelCoefficient: nullableNumber(row.coefficient),
      assessmentPrice: nullableNumber(row.assessment_price),
    };
  }

  async loadHistoricalSpend(
    workspaceId: string,
    accountId: string,
    beforeDs: string,
    days = 14,
  ): Promise<number[]> {
    const result = await this.pool.query<{ cost: string | number }>(
      `SELECT cost
       FROM account_metrics_daily
       WHERE workspace_id = $1 AND account_id = $2 AND ds < $3::date
         AND cost IS NOT NULL AND cost <> 0
       ORDER BY ds DESC
       LIMIT $4`,
      [workspaceId, accountId, beforeDs, days],
    );
    return result.rows
      .map((row) => nullableNumber(row.cost))
      .filter((value): value is number => value !== null);
  }

  async upsertCanonical(record: CanonicalMetricRecord): Promise<void> {
    const values = [
      record.workspaceId,
      record.accountId,
      record.ds,
      record.cost,
      record.exposure,
      record.click,
      record.conversion,
      record.realConversion,
      record.realCpa,
      record.cashCost,
      record.cashCpa,
      record.costSpace,
      record.gap,
      record.budget,
      record.budgetUsageRate,
      record.deductionRate,
      record.mainAdCostProportion,
      record.assessmentPriceSnapshot,
      record.wakeUv,
      record.potentialUv,
      record.fieldSources,
      record.dataAnomaly,
    ];
    const result = await this.pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, account_id, ds, cost, exposure, click, conversion,
         real_conversion, real_cpa, cash_cost, cash_cpa, cost_space, gap,
         budget, budget_usage_rate, deduction_rate, main_ad_cost_proportion,
         assessment_price_snapshot, wake_uv, potential_uv, field_sources,
         data_anomaly, computed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21, $22, now()
       )
       ON CONFLICT (workspace_id, account_id, ds) DO UPDATE SET
         cost = EXCLUDED.cost,
         exposure = EXCLUDED.exposure,
         click = EXCLUDED.click,
         conversion = EXCLUDED.conversion,
         real_conversion = EXCLUDED.real_conversion,
         real_cpa = EXCLUDED.real_cpa,
         cash_cost = EXCLUDED.cash_cost,
         cash_cpa = EXCLUDED.cash_cpa,
         cost_space = EXCLUDED.cost_space,
         gap = EXCLUDED.gap,
         budget = EXCLUDED.budget,
         budget_usage_rate = EXCLUDED.budget_usage_rate,
         deduction_rate = EXCLUDED.deduction_rate,
         main_ad_cost_proportion = EXCLUDED.main_ad_cost_proportion,
         assessment_price_snapshot = EXCLUDED.assessment_price_snapshot,
         wake_uv = EXCLUDED.wake_uv,
         potential_uv = EXCLUDED.potential_uv,
         field_sources = EXCLUDED.field_sources,
         data_anomaly = EXCLUDED.data_anomaly,
         computed_at = now()
       RETURNING account_id`,
      values,
    );
    if (result.rowCount !== 1) {
      throw new Error(`Failed to upsert canonical account ${record.accountId} on ${record.ds}`);
    }
  }
}
