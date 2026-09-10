import type { Pool } from "pg";
import { assessmentPriceEffectiveSql } from "./assessment-price-selection.js";

export interface EffectiveMetricSettings {
  channelCoefficient: number | null;
  channelCoefficientOp: "multiply" | "divide" | null;
  assessmentPrice: number | null;
}

export interface MetricLookupKey {
  media: string;
  accountId: string;
  ds: string;
}

export interface EffectiveMetricSettingsRow
  extends MetricLookupKey,
    EffectiveMetricSettings {
  workspaceId: string;
}

export interface HistoricalSpendRow extends MetricLookupKey {
  workspaceId: string;
  history: number[];
}

export interface CanonicalMetricRecord {
  workspaceId: string;
  media: string;
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

function settingNumber(value: string | number | null): number | null {
  if (value === null) return null;
  if ((typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) || !Number.isFinite(Number(value))) {
    throw new Error("Invalid effective metric settings");
  }
  return Number(value);
}

function coefficientDirection(value: unknown, coefficient: number | null): "multiply" | "divide" | null {
  if (coefficient === null && value === null) return null;
  if (coefficient === null || coefficient <= 0 || (value !== "multiply" && value !== "divide")) {
    throw new Error("Invalid effective metric settings");
  }
  return value;
}

function lookupKey(value: MetricLookupKey): string {
  return JSON.stringify([value.media, value.accountId, value.ds]);
}

function validateKeys(keys: readonly MetricLookupKey[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (key.media.trim() === "" || key.accountId.trim() === "" || !/^\d{4}-\d{2}-\d{2}$/.test(key.ds)) {
      throw new Error("Metric lookup keys require media, accountId and ISO date");
    }
    const encoded = lookupKey(key);
    if (seen.has(encoded)) {
      throw new Error("Metric lookup keys contain a duplicate account/date");
    }
    seen.add(encoded);
  }
}

function requireCompleteBatch(
  kind: string,
  requested: readonly MetricLookupKey[],
  returned: readonly MetricLookupKey[],
): void {
  const requestedKeys = new Set(requested.map(lookupKey));
  const returnedKeys = new Set(returned.map(lookupKey));
  if (returnedKeys.size !== returned.length) {
    throw new Error(`${kind} query returned duplicate account/date rows`);
  }
  if (requestedKeys.size !== returnedKeys.size) {
    throw new Error(`${kind} query did not return every requested account/date`);
  }
  for (const key of returnedKeys) {
    if (!requestedKeys.has(key)) {
      throw new Error(`${kind} query returned an unrequested account/date`);
    }
  }
}

function serializeLookupKeys(keys: readonly MetricLookupKey[]): string {
  return JSON.stringify(keys.map((key) => ({
    media: key.media,
    account_id: key.accountId,
    ds: key.ds,
  })));
}

export class MetricsRepository {
  constructor(private readonly pool: Pool) {}

  async loadEffectiveSettingsBatch(
    workspaceId: string,
    keys: readonly MetricLookupKey[],
  ): Promise<EffectiveMetricSettingsRow[]> {
    validateKeys(keys);
    if (keys.length === 0) return [];
    const result = await this.pool.query<{
      workspace_id: string;
      media: string;
      account_id: string;
      ds: string;
      coefficient: string | number | null;
      coefficient_op: unknown;
      assessment_price: string | number | null;
    }>(
      `WITH requested AS (
         SELECT media, account_id, ds
         FROM jsonb_to_recordset($2::jsonb) AS value(media text, account_id text, ds date)
       )
       SELECT account.workspace_id, account.media, account.account_id,
              to_char(requested.ds, 'YYYY-MM-DD') AS ds,
              coefficient.coefficient, coefficient.op AS coefficient_op, assessment.price AS assessment_price
       FROM requested
       JOIN accounts AS account
         ON account.workspace_id = $1
        AND account.media = requested.media
        AND account.account_id = requested.account_id
       LEFT JOIN LATERAL (
         SELECT value.coefficient, value.op
         FROM channel_coefficients AS value
         WHERE value.workspace_id = account.workspace_id
           AND value.media = account.media
           AND value.effective_date <= requested.ds
         ORDER BY value.effective_date DESC, value.id DESC
         LIMIT 1
       ) AS coefficient ON true
       LEFT JOIN task_accounts AS relation
         ON relation.workspace_id = account.workspace_id
        AND relation.media = account.media
        AND relation.account_id = account.account_id
        AND relation.valid_from <= requested.ds
        AND (relation.valid_to IS NULL OR relation.valid_to >= requested.ds)
       LEFT JOIN LATERAL (
         SELECT price.price
         FROM assessment_price_history AS price
         WHERE price.workspace_id = relation.workspace_id
           AND price.task_id = relation.task_id
           AND ${assessmentPriceEffectiveSql("price", "requested.ds")}
         ORDER BY price.effective_date DESC, price.id DESC
         LIMIT 1
       ) AS assessment ON true
       ORDER BY requested.ds, account.media, account.account_id`,
      [workspaceId, serializeLookupKeys(keys)],
    );
    const rows = result.rows.map((row) => {
      if (row.workspace_id !== workspaceId) throw new Error("Effective metric settings escaped workspace");
      const coefficient = settingNumber(row.coefficient);
      return {
        workspaceId: row.workspace_id,
        media: row.media,
        accountId: row.account_id,
        ds: row.ds,
        channelCoefficient: coefficient,
        channelCoefficientOp: coefficientDirection(row.coefficient_op, coefficient),
        assessmentPrice: settingNumber(row.assessment_price),
      };
    });
    requireCompleteBatch("Effective settings", keys, rows);
    return rows;
  }

  async loadHistoricalSpendBatch(
    workspaceId: string,
    keys: readonly MetricLookupKey[],
    days = 14,
  ): Promise<HistoricalSpendRow[]> {
    validateKeys(keys);
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      throw new Error("Historical spend days must be an integer between 1 and 366");
    }
    if (keys.length === 0) return [];
    const result = await this.pool.query<{
      workspace_id: string;
      media: string;
      account_id: string;
      ds: string;
      history: (string | number)[];
    }>(
      `WITH requested AS (
         SELECT media, account_id, ds
         FROM jsonb_to_recordset($2::jsonb) AS value(media text, account_id text, ds date)
       )
       SELECT account.workspace_id, account.media, account.account_id,
              to_char(requested.ds, 'YYYY-MM-DD') AS ds,
              ARRAY(
                SELECT metric.cost
                FROM account_metrics_daily AS metric
                WHERE metric.workspace_id = account.workspace_id
                  AND metric.media = account.media
                  AND metric.account_id = account.account_id
                  AND metric.ds < requested.ds
                  AND metric.cost IS NOT NULL AND metric.cost <> 0
                ORDER BY metric.ds DESC
                LIMIT $3
              ) AS history
       FROM requested
       JOIN accounts AS account
         ON account.workspace_id = $1
        AND account.media = requested.media
        AND account.account_id = requested.account_id
       ORDER BY requested.ds, account.media, account.account_id`,
      [workspaceId, serializeLookupKeys(keys), days],
    );
    const rows = result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      media: row.media,
      accountId: row.account_id,
      ds: row.ds,
      history: row.history
        .map((value) => nullableNumber(value))
        .filter((value): value is number => value !== null),
    }));
    requireCompleteBatch("Historical spend", keys, rows);
    return rows;
  }

  async upsertCanonicalBatch(records: readonly CanonicalMetricRecord[]): Promise<void> {
    if (records.length === 0) return;
    const keys = records.map((record) => ({
      media: record.media,
      accountId: `${record.workspaceId}\u0000${record.accountId}`,
      ds: record.ds,
    }));
    validateKeys(keys);
    const result = await this.pool.query(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS value(
           workspace_id uuid, media text, account_id text, ds date, cost numeric,
           exposure bigint, click bigint, conversion numeric, real_conversion numeric,
           real_cpa numeric, cash_cost numeric, cash_cpa numeric, cost_space numeric,
           gap numeric, budget numeric, budget_usage_rate numeric, deduction_rate numeric,
           main_ad_cost_proportion numeric, assessment_price_snapshot numeric,
           wake_uv numeric, potential_uv numeric, field_sources jsonb, data_anomaly boolean
         )
       )
       INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, exposure, click, conversion,
         real_conversion, real_cpa, cash_cost, cash_cpa, cost_space, gap,
         budget, budget_usage_rate, deduction_rate, main_ad_cost_proportion,
         assessment_price_snapshot, wake_uv, potential_uv, field_sources,
         data_anomaly, computed_at
       ) SELECT
         workspace_id, media, account_id, ds, cost, exposure, click, conversion,
         real_conversion, real_cpa, cash_cost, cash_cpa, cost_space, gap,
         budget, budget_usage_rate, deduction_rate, main_ad_cost_proportion,
         assessment_price_snapshot, wake_uv, potential_uv, field_sources,
         data_anomaly, now()
       FROM incoming
       ON CONFLICT (workspace_id, media, account_id, ds) DO UPDATE SET
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
      [
        JSON.stringify(
          records.map((record) => ({
            workspace_id: record.workspaceId,
            media: record.media,
            account_id: record.accountId,
            ds: record.ds,
            cost: record.cost,
            exposure: record.exposure,
            click: record.click,
            conversion: record.conversion,
            real_conversion: record.realConversion,
            real_cpa: record.realCpa,
            cash_cost: record.cashCost,
            cash_cpa: record.cashCpa,
            cost_space: record.costSpace,
            gap: record.gap,
            budget: record.budget,
            budget_usage_rate: record.budgetUsageRate,
            deduction_rate: record.deductionRate,
            main_ad_cost_proportion: record.mainAdCostProportion,
            assessment_price_snapshot: record.assessmentPriceSnapshot,
            wake_uv: record.wakeUv,
            potential_uv: record.potentialUv,
            field_sources: record.fieldSources,
            data_anomaly: record.dataAnomaly,
          })),
        ),
      ],
    );
    if (result.rowCount !== records.length) {
      throw new Error(`Failed to upsert canonical batch of ${records.length} rows`);
    }
  }
}
