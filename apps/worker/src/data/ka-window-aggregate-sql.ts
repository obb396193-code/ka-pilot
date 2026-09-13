// Internal fixed SQL fragments only. No browser/user SQL or column names enter here.
type Window = { from: string; to: string };
const columns = ["cost_yuan", "cash_yuan", "show", "click", "conv", "cash_assessment", "target"] as const;
const rawColumns = columns.filter((column) => column !== "target");
const maxFinite = "1.7976931348623157e308";
const invalid = (column: string) => `(typeof(${column}) NOT IN ('integer','real','null') OR ABS(CAST(${column} AS REAL)) > ${maxFinite})`;
const countMembers = "COUNT(ds)";
/**
 * v1.9.46（Q-041 ⑧）：团队源也按**部分合计**出数——Σ 有数的成员日，另发一列
 * `<col>_complete` 说明这个和是否覆盖了全部成员日。
 *
 * `api.md` v1.9.4 说「SQL 直出汇总拿不到逐成员缺失信息」——**那句话不成立**：
 * `COUNT(col)` 与 `COUNT(ds)` 就是逐成员完整性，这里一直有，只是原来用它做了
 * 「缺一个就整列 NULL」的判断而已。口径与个人源那条（`METRIC_AGGREGATE_SQL`）一致。
 *
 * 坏值仍旧优先：`INVALID_METRIC` 这一档不能被「部分」吞掉，否则一个坏源会伪装成部分合计。
 */
function completeSum(column: typeof columns[number]) {
  return `CASE WHEN MAX(CASE WHEN ${invalid(column)} THEN 1 ELSE 0 END)=1
    OR ABS(SUM(CAST(${column} AS REAL)))>${maxFinite}
    OR (COUNT(${column})>0 AND SUM(CAST(${column} AS REAL)) IS NULL) THEN 'INVALID_METRIC'
    WHEN ${countMembers}>0 THEN SUM(CAST(${column} AS REAL)) ELSE NULL END`;
}
/** 该列的和是否覆盖了全部成员日；`0/1`，与上面那列成对出现。 */
function completeFlag(column: typeof columns[number]) {
  return `CASE WHEN COUNT(${column})=${countMembers} AND ${countMembers}>0 THEN 1 ELSE 0 END`;
}
const accountKey = "media || char(31) || CAST(account_id AS TEXT)";
const aggregates = `${countMembers} AS expected_count,
  COUNT(DISTINCT CASE WHEN ds IS NOT NULL THEN ${accountKey} || char(31) || ds END) AS member_count,
  COALESCE(SUM(observed),0) AS observed_count,
  COUNT(DISTINCT CASE WHEN observed=1 THEN ${accountKey} END) AS account_count,
  COUNT(DISTINCT CASE WHEN ds IS NOT NULL THEN ${accountKey} END) AS catalog_count,
  COALESCE(SUM(bad_value),0) AS invalid_count,
  ${["cost_yuan", "cash_yuan", "show", "click", "conv", "target"].map((c) =>
    `${completeSum(c as typeof columns[number])} AS ${c},\n  ${completeFlag(c as typeof columns[number])} AS ${c}_complete`).join(",\n")},
  COUNT(CASE WHEN ds IS NOT NULL AND cash_assessment IS NULL THEN 1 END) AS missing_price_count,
  COUNT(DISTINCT cash_assessment) AS price_count,
  CASE WHEN COUNT(DISTINCT cash_assessment)=1 THEN MIN(cash_assessment) ELSE NULL END AS unique_price`;

/** The input grid is produced solely by the Registry; aggregation and both periods
 * remain inside one SQLite statement, not separately refreshed HTTP requests.
 */
export function buildKaWindowAggregateSql(gridSql: string, window: Window, previous: Window | null): string {
  // ISO dates come from the strict Registry/queryWindow schema, not raw text.
  const periods = [`('current','${window.from}','${window.to}')`,
    ...(previous === null ? [] : [`('previous','${previous.from}','${previous.to}')`])].join(",");
  const badIdentity = `(typeof(media)<>'text' OR length(media) NOT BETWEEN 1 AND 32 OR media GLOB '*[^A-Z0-9_]*'
    OR (typeof(account_id)='text' AND (length(account_id) NOT BETWEEN 1 AND 128 OR account_id GLOB '*[^A-Za-z0-9_-]*'))
    OR (typeof(account_id)='integer' AND (account_id<0 OR account_id>9007199254740991))
    OR typeof(account_id) NOT IN ('text','integer'))`;
  return `WITH grid AS (${gridSql}),
    source_guard AS (SELECT COALESCE(MAX(source_row_count),0)<>COALESCE(SUM(observed),0) AS lost_rows FROM grid),
    periods(period,date_from,date_to) AS (VALUES ${periods}),
    members AS (
      SELECT p.period,p.date_from,p.date_to,g.*,
        CASE WHEN g.ds IS NOT NULL AND (${badIdentity} OR (SELECT lost_rows FROM source_guard)=1 OR ${rawColumns.map(invalid).join(" OR ")}
          OR ABS(CAST(cash_assessment AS REAL)*CAST(conv AS REAL))>${maxFinite}) THEN 1 ELSE 0 END AS bad_value,
        cash_assessment*CAST(conv AS REAL) AS target
      FROM periods p LEFT JOIN grid g ON g.ds BETWEEN p.date_from AND p.date_to
    ), account_stats AS (
      SELECT period,media,account_id,${aggregates}
      FROM members WHERE ds IS NOT NULL GROUP BY period,media,account_id
    ), rates AS (
      SELECT period,
        COUNT(CASE WHEN invalid_count=0 AND expected_count=member_count AND typeof(cash_yuan) IN ('integer','real')
          AND typeof(target) IN ('integer','real')
          AND cash_yuan_complete=1 AND target_complete=1 THEN 1 END) AS determinable_count,
        COUNT(CASE WHEN invalid_count=0 AND expected_count=member_count AND typeof(cash_yuan) IN ('integer','real')
          AND typeof(target) IN ('integer','real')
          AND cash_yuan_complete=1 AND target_complete=1 AND cash_yuan<=target THEN 1 END) AS on_target_count
      FROM account_stats GROUP BY period
    ), days AS (
      SELECT period,date_from,date_to,ds,${aggregates}
      FROM members WHERE ds IS NOT NULL GROUP BY period,date_from,date_to,ds
    ), windows AS (
      SELECT period,date_from,date_to,${aggregates} FROM members GROUP BY period,date_from,date_to
    ) SELECT 'window' AS kind,w.period,w.date_from,w.date_to,NULL AS ds,
      w.expected_count,w.member_count,w.observed_count,w.account_count,w.catalog_count,w.invalid_count,
      w.cost_yuan,w.cash_yuan,w.show,w.click,w.conv,w.target,w.cost_yuan_complete,w.cash_yuan_complete,w.show_complete,w.click_complete,w.conv_complete,w.target_complete,w.missing_price_count,w.price_count,w.unique_price,
      COALESCE(r.determinable_count,0) AS determinable_count,COALESCE(r.on_target_count,0) AS on_target_count,
      (SELECT COUNT(*) FROM days d WHERE d.period=w.period AND typeof(d.cash_yuan) IN ('integer','real')
        AND typeof(d.target) IN ('integer','real')
        AND d.cash_yuan_complete=1 AND d.target_complete=1 AND d.cash_yuan>d.target) AS day_over_count
    FROM windows w LEFT JOIN rates r ON r.period=w.period
    UNION ALL SELECT 'day',d.period,d.date_from,d.date_to,d.ds,
      d.expected_count,d.member_count,d.observed_count,d.account_count,d.catalog_count,d.invalid_count,
      d.cost_yuan,d.cash_yuan,d.show,d.click,d.conv,d.target,d.cost_yuan_complete,d.cash_yuan_complete,d.show_complete,d.click_complete,d.conv_complete,d.target_complete,d.missing_price_count,d.price_count,d.unique_price,
      NULL,NULL,CASE WHEN typeof(d.cash_yuan) IN ('integer','real') AND typeof(d.target) IN ('integer','real')
        AND d.cash_yuan_complete=1 AND d.target_complete=1 AND d.cash_yuan>d.target THEN 1 ELSE 0 END
    FROM days d ORDER BY period,kind DESC,ds LIMIT 10001`;
}
