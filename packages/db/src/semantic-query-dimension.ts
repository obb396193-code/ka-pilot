import type { Pool } from "pg";

import {
  METRIC_AGGREGATE_SQL,
  EXPECTED_METRIC_CTE,
  mapMetricSummary,
  type AggregateDatabaseRow,
} from "./semantic-query-metrics.js";
import { buildMetricFilter, validateScope, SemanticQueryContractError } from "./semantic-query-support.js";
import {
  AmbiguousTaskMappingError,
  type SemanticDimensionQuery,
  type SemanticDimensionRow,
  type SupportedDimension,
} from "./semantic-query-types.js";

interface DimensionDatabaseRow extends AggregateDatabaseRow {
  workspace_id?: string;
  media?: string;
  dimension_key: string | null;
  dimension_label: string | null;
}
interface OverlapDatabaseRow {
  account_id: string;
  ds: string;
  task_ids: string[];
}

interface DimensionSql {
  key: string;
  label: string;
  joins: string;
}

function dimensionSql(dimension: SupportedDimension): DimensionSql {
  if (dimension === "account") {
    return {
      key: "metric.account_id",
      label: "account.account_name",
      joins: "",
    };
  }
  const joins = `
    LEFT JOIN task_accounts AS relation
      ON relation.workspace_id = metric.workspace_id
     AND relation.media = metric.media
     AND relation.account_id = metric.account_id
     AND relation.valid_from <= metric.ds
     AND (relation.valid_to IS NULL OR relation.valid_to >= metric.ds)
    LEFT JOIN tasks AS task
      ON task.workspace_id = relation.workspace_id
     AND task.task_id = relation.task_id`;
  return dimension === "task"
    ? { key: "relation.task_id", label: "task.task_name", joins }
    : { key: "task.biz_name", label: "task.biz_name", joins };
}

function assertSupportedDimension(value: string): asserts value is SupportedDimension {
  if (value !== "account" && value !== "task" && value !== "biz") {
    throw new Error(`Unsupported dimension: ${value}`);
  }
}

async function assertNoTaskOverlap(pool: Pick<Pool, "query">, input: SemanticDimensionQuery): Promise<void> {
  const filter = buildMetricFilter(input, { includeTaskFilter: false });
  const result = await pool.query<OverlapDatabaseRow>(
    `SELECT metric.account_id, to_char(metric.ds, 'YYYY-MM-DD') AS ds,
            array_agg(relation.task_id ORDER BY relation.task_id) AS task_ids
     FROM account_metrics_daily AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.media = metric.media
      AND account.account_id = metric.account_id
     JOIN task_accounts AS relation
       ON relation.workspace_id = metric.workspace_id
      AND relation.media = metric.media
      AND relation.account_id = metric.account_id
      AND relation.valid_from <= metric.ds
      AND (relation.valid_to IS NULL OR relation.valid_to >= metric.ds)
     WHERE ${filter.whereSql}
     GROUP BY metric.media, metric.account_id, metric.ds
     HAVING count(relation.id) > 1
     ORDER BY metric.ds, metric.account_id
     LIMIT 1`,
    filter.values,
  );
  const overlap = result.rows[0];
  if (overlap) {
    throw new AmbiguousTaskMappingError(overlap.account_id, overlap.ds, overlap.task_ids);
  }
}

export async function queryMetricDimension(
  pool: Pick<Pool, "query">,
  input: SemanticDimensionQuery,
): Promise<SemanticDimensionRow[]> {
  validateScope(input);
  assertSupportedDimension(input.dimension);
  if (input.dimension !== "account") {
    await assertNoTaskOverlap(pool, input);
  }

  const filter = buildMetricFilter(input, {
    includeTaskFilter: input.dimension === "account",
  });
  const sql = dimensionSql(input.dimension);
  const values = [...filter.values];
  const taskCondition =
    input.dimension !== "account" && input.filters?.taskId
      ? `AND relation.task_id = $${values.push(input.filters.taskId)}`
      : "";
  const result = await pool.query<DimensionDatabaseRow>(
    `${EXPECTED_METRIC_CTE} SELECT ${input.dimension === "account" ? "metric.workspace_id, metric.media," : ""}
            ${sql.key} AS dimension_key, ${sql.label} AS dimension_label,
            ${METRIC_AGGREGATE_SQL}
     FROM expected_metric AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.media = metric.media
      AND account.account_id = metric.account_id
     ${sql.joins}
     WHERE ${filter.whereSql}
       ${taskCondition}
     GROUP BY ${input.dimension === "account" ? "metric.workspace_id, metric.media, " : ""}${sql.key}, ${sql.label}
     ORDER BY cost DESC NULLS LAST, ${sql.key} COLLATE "C" ASC NULLS FIRST
       ${input.dimension === "account" ? ', metric.media COLLATE "C" ASC' : ""}
     LIMIT 10001`,
    values,
  );
  if (result.rows.length > 10000 || Buffer.byteLength(JSON.stringify(result.rows)) >= 16 * 1024 * 1024) {
    throw new SemanticQueryContractError("Dimension result exceeds query boundary");
  }
  const seen = new Set<string>();
  return result.rows.map((row) => decodeDimensionRow(row, input, seen));
}

function invalidDimension(): never { throw new SemanticQueryContractError("Invalid dimension result"); }

function decodeDimensionRow(row: DimensionDatabaseRow, input: SemanticDimensionQuery, seen: Set<string>): SemanticDimensionRow {
  if ((row.dimension_key !== null && typeof row.dimension_key !== "string") ||
      (row.dimension_label !== null && typeof row.dimension_label !== "string")) return invalidDimension();
  // Present invalid values cannot coerce to zero or disappear as missing metrics.
  for (const key of ["row_count", "account_count", "anomaly_rows", "cost", "exposure", "click", "conversion",
    "real_conversion", "cash_cost", "cost_space", "wake_uv", "potential_uv"] as const) {
    const value = row[key];
    if (value === null && !["row_count", "account_count", "anomaly_rows"].includes(key)) continue;
    if ((typeof value !== "string" && typeof value !== "number") ||
      (typeof value === "string" && !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) || !Number.isFinite(Number(value))) return invalidDimension();
  }
  const metrics = mapMetricSummary(row);
  if (![metrics.rowCount, metrics.accountCount, metrics.anomalyRows].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    metrics.accountCount > metrics.rowCount || metrics.anomalyRows > metrics.rowCount) return invalidDimension();
  let accountIdentity: SemanticDimensionRow["accountIdentity"];
  if (input.dimension === "account") {
    const filters = input.filters;
    if (row.workspace_id !== input.workspaceId || typeof row.media !== "string" || !/^[A-Z0-9_]{1,32}$/.test(row.media) ||
      typeof row.dimension_key !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.dimension_key) || metrics.accountCount > 1 ||
      (filters?.media !== undefined && row.media !== filters.media) ||
      (filters?.accountId !== undefined && row.dimension_key !== filters.accountId) ||
      (filters?.accountIds !== undefined && !filters.accountIds.includes(row.dimension_key)) ||
      (filters?.accountScopes !== undefined && !filters.accountScopes.some((a) => a.media === row.media && a.accountId === row.dimension_key))) return invalidDimension();
    accountIdentity = { workspaceId: input.workspaceId, media: row.media, accountId: row.dimension_key };
  }
  const identity = JSON.stringify(accountIdentity ?? row.dimension_key);
  if (seen.has(identity)) return invalidDimension();
  seen.add(identity);
  return { dimensionKey: row.dimension_key, dimensionLabel: row.dimension_label, metrics,
    ...(accountIdentity ? { accountIdentity } : {}) };
}
