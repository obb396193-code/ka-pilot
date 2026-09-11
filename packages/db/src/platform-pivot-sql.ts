import { etlBatchReadableSql } from "./etl-batch-readability.js";
import { assessmentPriceEffectiveSql } from "./assessment-price-selection.js";

export const PIVOT_METRIC_FIELDS = ["cost", "cash_cost", "exposure", "click", "conversion", "real_conversion", "wake_uv", "potential_uv"] as const;

/** Identifiers are code-owned. The only account population is the bound approved tuple list. */
export const PLATFORM_PIVOT_SQL = `/* platform-pivot-members */
WITH expected AS (
  SELECT $1::uuid AS workspace_id, allowed.media, allowed.account_id, $2::date + day.i AS ds
  FROM jsonb_to_recordset($4::jsonb) AS allowed(media text, account_id text)
  CROSS JOIN generate_series(0, $3::date - $2::date) AS day(i)
)
SELECT expected.workspace_id, expected.media, expected.account_id, expected.ds::text AS ds,
  metric.account_id IS NOT NULL AS observed, account.account_name,
  relation.task_id, task.task_name, task.biz_name,
  ${PIVOT_METRIC_FIELDS.map(field => `metric.${field}`).join(", ")},
  assessment.id::text AS price_id, assessment.price, assessment.effective_date::text AS effective_date,
  metric.computed_at
FROM expected
LEFT JOIN accounts AS account
  ON account.workspace_id = expected.workspace_id AND account.media = expected.media
 AND account.account_id = expected.account_id
LEFT JOIN account_metrics_daily AS metric
  ON metric.workspace_id = expected.workspace_id AND metric.media = expected.media
 AND metric.account_id = expected.account_id AND metric.ds = expected.ds
 AND ${etlBatchReadableSql("metric")}
LEFT JOIN task_accounts AS relation
  ON relation.workspace_id = expected.workspace_id AND relation.media = expected.media
 AND relation.account_id = expected.account_id
 AND relation.valid_from <= expected.ds AND (relation.valid_to IS NULL OR relation.valid_to >= expected.ds)
LEFT JOIN tasks AS task
  ON task.workspace_id = relation.workspace_id AND task.task_id = relation.task_id
LEFT JOIN LATERAL (
  SELECT price.id, price.price, price.effective_date FROM assessment_price_history AS price
  WHERE price.workspace_id = relation.workspace_id AND price.task_id = relation.task_id
    AND ${assessmentPriceEffectiveSql("price", "expected.ds")}
  ORDER BY price.effective_date DESC, price.id DESC LIMIT 1
) AS assessment ON true
ORDER BY expected.media COLLATE "C", expected.account_id COLLATE "C", expected.ds
LIMIT 10001`;
