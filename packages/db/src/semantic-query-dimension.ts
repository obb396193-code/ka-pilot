import type { Pool } from "pg";

import {
  METRIC_AGGREGATE_SQL,
  mapMetricSummary,
  type AggregateDatabaseRow,
} from "./semantic-query-metrics.js";
import { buildMetricFilter, validateScope } from "./semantic-query-support.js";
import {
  AmbiguousTaskMappingError,
  type SemanticDimensionQuery,
  type SemanticDimensionRow,
  type SupportedDimension,
} from "./semantic-query-types.js";

interface DimensionDatabaseRow extends AggregateDatabaseRow {
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

async function assertNoTaskOverlap(pool: Pool, input: SemanticDimensionQuery): Promise<void> {
  const filter = buildMetricFilter(input, { includeTaskFilter: false });
  const result = await pool.query<OverlapDatabaseRow>(
    `SELECT metric.account_id, to_char(metric.ds, 'YYYY-MM-DD') AS ds,
            array_agg(relation.task_id ORDER BY relation.task_id) AS task_ids
     FROM account_metrics_daily AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.account_id = metric.account_id
     JOIN task_accounts AS relation
       ON relation.workspace_id = metric.workspace_id
      AND relation.account_id = metric.account_id
      AND relation.valid_from <= metric.ds
      AND (relation.valid_to IS NULL OR relation.valid_to >= metric.ds)
     WHERE ${filter.whereSql}
     GROUP BY metric.account_id, metric.ds
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
  pool: Pool,
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
    `SELECT ${sql.key} AS dimension_key, ${sql.label} AS dimension_label,
            ${METRIC_AGGREGATE_SQL}
     FROM account_metrics_daily AS metric
     JOIN accounts AS account
       ON account.workspace_id = metric.workspace_id
      AND account.account_id = metric.account_id
     ${sql.joins}
     WHERE ${filter.whereSql}
       ${taskCondition}
     GROUP BY ${sql.key}, ${sql.label}
     ORDER BY sum(metric.cost) DESC NULLS LAST, ${sql.key} ASC NULLS FIRST`,
    values,
  );
  return result.rows.map((row) => ({
    dimensionKey: row.dimension_key,
    dimensionLabel: row.dimension_label,
    metrics: mapMetricSummary(row),
  }));
}
