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

/**
 * v1.9.40（老板拍板 B 的主体，2026-09-12 重做）：窗口聚合按**部分合计**出数。
 *
 * `sum()` 天然跳过缺的账户日，所以这里直接给「Σ 有数的那部分」，另发一列 `<col>_complete`
 * 说明这个和是不是覆盖了全部期望账户日。原来的写法是「只要缺一个账户日，整列给 NULL」——
 * 页面上最显眼的几张卡因此长期是「−」，而缺的往往只是几十户里的一两户。
 *
 * 坏值（NaN/Infinity）**仍然进 sum**，让解码层抛：把它们当缺数吞掉，会把一个坏掉的源
 * 伪装成一份「部分合计」。
 *
 * ⚠️ 这个口径与 `window-assessment-repository.load` 必须一致：那边按天分组，
 * 同一天只要有一个账户缺数就整天塌成 NULL 的话，两边算出的窗口合计不同，
 * `platform-window-query` 的一致性核对会把整条 summary 判废（2026-09-12 P0 就是这么炸的）。
 */
// These identifiers are code-owned, never request SQL. NULL cannot conceal a corrupt NaN/Infinity.
export const METRIC_AGGREGATE_SQL = `
  count(*) FILTER (WHERE metric.observed)::text AS row_count,
  count(DISTINCT (metric.media, metric.account_id)) FILTER (WHERE metric.observed)::text AS account_count,
  ${SUM_COLUMNS.map((column) => `sum(metric.${column}) AS ${column},
    (count(metric.${column})=count(*)
     OR bool_or(metric.${column}::text IN ('NaN','Infinity','-Infinity'))) AS ${column}_complete`).join(",\n  ")},
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

function buildRatios(values: Omit<MetricSummary, "ratios" | "partial">): MetricRatios {
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

/**
 * v1.9.40：哪些列给的是**部分合计**。只列「有值但不完整」的——
 * 一个列压根没值时仍旧是 missing，标成 partial 等于宣称「有一部分数据」而其实一条都没有。
 */
function partialColumns(row: AggregateDatabaseRow): string[] {
  return SUM_COLUMNS.filter((column) => {
    const complete = (row as unknown as Record<string, unknown>)[`${column}_complete`];
    return complete === false && (row as unknown as Record<string, unknown>)[column] !== null;
  }).map((column) => column);
}

export function mapMetricSummary(row: AggregateDatabaseRow): MetricSummary {
  const values: Omit<MetricSummary, "ratios" | "partial"> = {
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
  // 比率照常由部分合计的分子分母算出来——「算出来了但只覆盖部分天」与「算不出来」
  // 在用户眼里完全不是一回事，压成 undefined 会把前者退回一个「−」。
  return { ...values, ratios: buildRatios(values), partial: partialColumns(row) };
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
