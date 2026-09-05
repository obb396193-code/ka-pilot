/** Code-owned SQL only. The expected set is the union of observed raw/canonical tuples,
 * not all workspace accounts: ingestion may be restricted to one credential's explicit grants.
 * Global ETL coverage is a separate check and cannot be inferred from matching totals.
 */
export const RECONCILE_TOTALS_SQL = `WITH latest_raw AS (
  SELECT DISTINCT ON (media,account_id,resource) media,account_id,resource,payload
  FROM metrics_raw WHERE workspace_id=$1 AND ds=$2::date
    AND resource IN ('account_offline','account_realtime')
  ORDER BY media,account_id,resource,fetched_at DESC,id DESC
), source_rows AS (
  SELECT media,account_id,
    (max(payload::text) FILTER (WHERE resource='account_offline'))::jsonb AS offline,
    (max(payload::text) FILTER (WHERE resource='account_realtime'))::jsonb AS realtime
  FROM latest_raw GROUP BY media,account_id
), scoped_accounts AS (
  SELECT media,account_id FROM source_rows
  UNION
  SELECT media,account_id FROM account_metrics_daily WHERE workspace_id=$1 AND ds=$2::date
), selected AS (
  SELECT metric.cost AS canonical_value,
    CASE
      WHEN metric.field_sources->>'cost' IN ('realtime','gap_filled') THEN source.realtime->>'account_cost'
      WHEN metric.field_sources->>'cost'='offline' THEN source.offline->>'cost_api'
      ELSE COALESCE(source.offline->>'cost_api',source.realtime->>'account_cost')
    END AS raw_text
  FROM scoped_accounts AS account
  LEFT JOIN source_rows AS source USING (media,account_id)
  LEFT JOIN account_metrics_daily AS metric ON metric.workspace_id=$1 AND metric.ds=$2::date
    AND metric.media=account.media AND metric.account_id=account.account_id
), validated AS (
  SELECT *, raw_text ~ '^-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' AS raw_valid
  FROM selected
), compared_values AS (
  SELECT canonical_value, CASE WHEN raw_valid THEN raw_text::numeric ELSE NULL END AS raw_value,
    (raw_text IS NOT NULL AND NOT raw_valid)
      OR canonical_value::text IN ('NaN','Infinity','-Infinity') AS invalid
  FROM validated
)
SELECT CASE WHEN count(raw_value)=count(*) THEN sum(raw_value) ELSE NULL END AS raw_total,
       CASE WHEN count(canonical_value)=count(*) THEN sum(canonical_value) ELSE NULL END AS canonical_total,
       bool_or(invalid) AS invalid
FROM compared_values`;
