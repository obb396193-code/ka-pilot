import { safeDivide } from "@ka/domain";
import type { Pool } from "pg";

import { buildMetricFilter, nullableNumber } from "./semantic-query-support.js";
import type {
  MetricRatios,
  MetricSummary,
  MetricTrendRow,
  SemanticQueryScope,
} from "./semantic-query-types.js";

export interface AggregateDatabaseRow {
  row_count: string | number;
  account_count: string | number;
  cost: string | number;
  exposure: string | number;
  click: string | number;
  conversion: string | number;
  real_conversion: string | number;
  cash_cost: string | number;
  cost_space: string | number;
  wake_uv: string | number;
  potential_uv: string | number;
  anomaly_rows: string | number;
}

interface TrendDatabaseRow extends AggregateDatabaseRow {
  ds: string;
}

export const METRIC_AGGREGATE_SQL = `
  count(*)::text AS row_count,
  count(DISTINCT (metric.media, metric.account_id))::text AS account_count,
  COALESCE(sum(metric.cost), 0) AS cost,
  COALESCE(sum(metric.exposure), 0) AS exposure,
  COALESCE(sum(metric.click), 0) AS click,
  COALESCE(sum(metric.conversion), 0) AS conversion,
  COALESCE(sum(metric.real_conversion), 0) AS real_conversion,
  COALESCE(sum(metric.cash_cost), 0) AS cash_cost,
  COALESCE(sum(metric.cost_space), 0) AS cost_space,
  COALESCE(sum(metric.wake_uv), 0) AS wake_uv,
  COALESCE(sum(metric.potential_uv), 0) AS potential_uv,
  count(*) FILTER (WHERE metric.data_anomaly)::text AS anomaly_rows`;

function requiredNumber(value: string | number): number {
  const parsed = nullableNumber(value);
  if (parsed === null) {
    throw new Error(`Metric aggregate returned a non-numeric value: ${String(value)}`);
  }
  return parsed;
}

function subtractOne(ratio: ReturnType<typeof safeDivide>): ReturnType<typeof safeDivide> {
  return ratio.state === "finite"
    ? { value: (ratio.value as number) - 1, state: "finite" }
    : ratio;
}

function buildRatios(values: Omit<MetricSummary, "ratios">): MetricRatios {
  return {
    ctr: safeDivide(values.click, values.exposure),
    cvr: safeDivide(values.conversion, values.click),
    realCpa: safeDivide(values.cost, values.realConversion, {
      infiniteWhenPositiveNumerator: true,
    }),
    cashCpa: safeDivide(values.cashCost, values.realConversion, {
      infiniteWhenPositiveNumerator: true,
    }),
    gap: subtractOne(safeDivide(values.conversion, values.realConversion)),
    potentialRate: safeDivide(values.potentialUv, values.wakeUv),
    biConversionRate: safeDivide(values.realConversion, values.potentialUv),
  };
}

export function mapMetricSummary(row: AggregateDatabaseRow): MetricSummary {
  const values: Omit<MetricSummary, "ratios"> = {
    rowCount: requiredNumber(row.row_count),
    accountCount: requiredNumber(row.account_count),
    cost: requiredNumber(row.cost),
    exposure: requiredNumber(row.exposure),
    click: requiredNumber(row.click),
    conversion: requiredNumber(row.conversion),
    realConversion: requiredNumber(row.real_conversion),
    cashCost: requiredNumber(row.cash_cost),
    costSpace: requiredNumber(row.cost_space),
    wakeUv: requiredNumber(row.wake_uv),
    potentialUv: requiredNumber(row.potential_uv),
    anomalyRows: requiredNumber(row.anomaly_rows),
  };
  return { ...values, ratios: buildRatios(values) };
}

export async function queryMetricSummary(
  pool: Pool,
  scope: SemanticQueryScope,
): Promise<MetricSummary> {
  const filter = buildMetricFilter(scope);
  const result = await pool.query<AggregateDatabaseRow>(
    `SELECT ${METRIC_AGGREGATE_SQL}
     FROM account_metrics_daily AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.media = metric.media
      AND account.account_id = metric.account_id
     WHERE ${filter.whereSql}`,
    filter.values,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Metric summary query did not return a row");
  }
  return mapMetricSummary(row);
}

export async function queryMetricTrend(
  pool: Pool,
  scope: SemanticQueryScope,
): Promise<MetricTrendRow[]> {
  const filter = buildMetricFilter(scope);
  const result = await pool.query<TrendDatabaseRow>(
    `SELECT to_char(metric.ds, 'YYYY-MM-DD') AS ds, ${METRIC_AGGREGATE_SQL}
     FROM account_metrics_daily AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.media = metric.media
      AND account.account_id = metric.account_id
     WHERE ${filter.whereSql}
     GROUP BY metric.ds
     ORDER BY metric.ds ASC`,
    filter.values,
  );
  return result.rows.map((row) => ({ ds: row.ds, metrics: mapMetricSummary(row) }));
}
