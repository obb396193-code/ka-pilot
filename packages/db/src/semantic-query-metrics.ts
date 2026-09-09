import { safeDivide } from "@ka/domain";
import type { Pool } from "pg";
import { etlBatchReadableSql } from "./etl-batch-readability.js";

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
  cost: string | number | null;
  exposure: string | number | null;
  click: string | number | null;
  conversion: string | number | null;
  real_conversion: string | number | null;
  cash_cost: string | number | null;
  cost_space: string | number | null;
  wake_uv: string | number | null;
  potential_uv: string | number | null;
  anomaly_rows: string | number;
}

interface TrendDatabaseRow extends AggregateDatabaseRow {
  ds: string;
}

const SUM_COLUMNS = ["cost", "exposure", "click", "conversion", "real_conversion",
  "cash_cost", "cost_space", "wake_uv", "potential_uv"] as const;

// These identifiers are code-owned, never request SQL. NULL cannot conceal a corrupt NaN/Infinity.
export const METRIC_AGGREGATE_SQL = `
  count(*) FILTER (WHERE metric.observed)::text AS row_count,
  count(DISTINCT (metric.media, metric.account_id)) FILTER (WHERE metric.observed)::text AS account_count,
  ${SUM_COLUMNS.map((column) => `CASE WHEN count(metric.${column})=count(*)
    OR bool_or(metric.${column}::text IN ('NaN','Infinity','-Infinity'))
    THEN sum(metric.${column}) ELSE NULL END AS ${column}`).join(",\n  ")},
  count(*) FILTER (WHERE metric.data_anomaly)::text AS anomaly_rows`;

/** Expected account-days remain visible even when ETL has no row; observed counts stay factual.
 * Date arithmetic is date+integer, independent of the database session timezone/DST.
 * Outer buildMetricFilter retains the trusted workspace/media/account tuple and effective task scope.
 */
export const EXPECTED_METRIC_CTE = `WITH expected_metric AS (
  SELECT account.workspace_id, account.media, account.account_id,
    $2::date+day.day_index AS ds, stored.account_id IS NOT NULL AS observed,
    ${SUM_COLUMNS.map((column) => `stored.${column}`).join(", ")}, stored.data_anomaly
  FROM accounts AS account
  CROSS JOIN generate_series(0, $3::date-$2::date) AS day(day_index)
  LEFT JOIN account_metrics_daily AS stored
    ON stored.workspace_id=account.workspace_id AND stored.media=account.media
    AND stored.account_id=account.account_id AND stored.ds=$2::date+day.day_index
    AND ${etlBatchReadableSql("stored")}
  WHERE account.workspace_id=$1
)`;

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
    cost: nullableNumber(row.cost),
    exposure: nullableNumber(row.exposure),
    click: nullableNumber(row.click),
    conversion: nullableNumber(row.conversion),
    realConversion: nullableNumber(row.real_conversion),
    cashCost: nullableNumber(row.cash_cost),
    costSpace: nullableNumber(row.cost_space),
    wakeUv: nullableNumber(row.wake_uv),
    potentialUv: nullableNumber(row.potential_uv),
    anomalyRows: requiredNumber(row.anomaly_rows),
  };
  return { ...values, ratios: buildRatios(values) };
}

export async function queryMetricSummary(
  pool: Pick<Pool, "query">,
  scope: SemanticQueryScope,
): Promise<MetricSummary> {
  const filter = buildMetricFilter(scope);
  const result = await pool.query<AggregateDatabaseRow>(
    `${EXPECTED_METRIC_CTE} SELECT ${METRIC_AGGREGATE_SQL}
     FROM expected_metric AS metric
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
  pool: Pick<Pool, "query">,
  scope: SemanticQueryScope,
): Promise<MetricTrendRow[]> {
  const filter = buildMetricFilter(scope);
  const result = await pool.query<TrendDatabaseRow>(
    `${EXPECTED_METRIC_CTE} SELECT to_char(metric.ds, 'YYYY-MM-DD') AS ds, ${METRIC_AGGREGATE_SQL}
     FROM expected_metric AS metric
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
