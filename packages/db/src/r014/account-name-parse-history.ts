/**
 * v1.9.49 ①（Q-044 ③）：`account_name_parses` 从「一个账户一行」变成「一个账户按业务日多行」。
 *
 * 读路径分两种，**各只有一个定义**：
 * - 要「当前态」的（归属清洗列表、确认、人工改段、账户列表的维度）→ `latestParseSql`；
 * - 要「某个业务日的归属」的（透视、维度、日报、看板）→ 另一个按日取行的 helper。
 *
 * 为什么必须收成一处：这张表被十几处 SQL 读写，每处各写一遍「取最新那行」，
 * 迟早有一处漏写。漏写的表现不是报错，而是那一处**突然读到同一个账户的好几行**——
 * 列表里一个账户出现两次、维度查询的「每账户一行」守卫把整条响应判废。
 */

/**
 * 业务日，与 `shanghaiTaskBusinessDate` 同一口径：UTC 时刻 + 5 小时取日期（上海 03:00 切日）。
 * 在 SQL 里算而不是从应用传：同一个事务里「今天」只取一次时钟，不会与数据库的 now() 分叉。
 * 迁移 031 是 .cjs、引不了这里，所以那边手抄了同一个式子——`account-name-parse-history.test.ts`
 * 有一条绊线逐字比对两处，并在 03:00 切日点上与 domain 的函数对拍。
 */
export function businessDateSql(timestampExpr: string): string {
  // 只接代码里写死的表达式（`now()`、`$1::timestamptz`），从不接请求参数。
  return `(((${timestampExpr}) AT TIME ZONE 'UTC') + interval '5 hours')::date`;
}

export const BUSINESS_DATE_TODAY_SQL = `(${businessDateSql("now()")})`;

const ALIAS = /^[a-z][a-z0-9_]*$/;

/**
 * 「这一行是该账户最新的那一行」。用在 WHERE 或 LEFT JOIN 的 ON 里。
 *
 * 别名只收小写标识符：它会被原样拼进 SQL，与 `etlBatchReadableSql` 同一道闸。
 * 内层别名叫 `latest_parse`，避开调用方常用的 `p`/`parse`/`a`，免得名字解析命中外层
 * ——那种命中不报错，只会让条件恒真（参见 `accountScopeClause` 那次越权）。
 */
export function latestParseSql(alias: string): string {
  if (!ALIAS.test(alias)) throw new Error("Invalid account name parse alias");
  return `${alias}.effective_from = (
    SELECT max(latest_parse.effective_from) FROM account_name_parses AS latest_parse
    WHERE latest_parse.workspace_id = ${alias}.workspace_id
      AND latest_parse.media = ${alias}.media
      AND latest_parse.account_id = ${alias}.account_id)`;
}
