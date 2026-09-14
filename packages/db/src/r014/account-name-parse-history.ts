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
const TIMESTAMP_EXPRESSIONS: ReadonlySet<string> = new Set(["now()", "$1::timestamptz"]);

export function businessDateSql(timestampExpr: "now()" | "$1::timestamptz"): string {
  // 只接这两个写死的表达式，从不接请求参数；类型挡一道，运行时再挡一道（绕过类型的调用照样被拒）。
  if (!TIMESTAMP_EXPRESSIONS.has(timestampExpr)) throw new Error("Invalid business date timestamp expression");
  return `(((${timestampExpr}) AT TIME ZONE 'UTC') + interval '5 hours')::date`;
}

export const BUSINESS_DATE_TODAY_SQL = `(${businessDateSql("now()")})`;

/** 能拼进 SQL 的表别名只有这三个字面量（`sql-interpolation-guard` 登记过、并逐个验调用点）；不收调用方变量。 */
export type ParseAlias = "parse" | "p" | "account_name_parses";
const PARSE_ALIASES: ReadonlySet<string> = new Set<ParseAlias>(["parse", "p", "account_name_parses"]);

/**
 * 「这一行是该账户最新的那一行」。用在 WHERE 或 LEFT JOIN 的 ON 里。
 *
 * 别名只收 `ParseAlias` 的三个字面量：它会被原样拼进 SQL，定义处运行时再校验一次。
 * 内层别名叫 `latest_parse`，避开调用方常用的 `p`/`parse`/`a`，免得名字解析命中外层
 * ——那种命中不报错，只会让条件恒真（参见 `accountScopeClause` 那次越权）。
 */
export function latestParseSql(alias: ParseAlias): string {
  if (!PARSE_ALIASES.has(alias)) throw new Error("Invalid account name parse alias");
  return `${alias}.effective_from = (
    SELECT max(latest_parse.effective_from) FROM account_name_parses AS latest_parse
    WHERE latest_parse.workspace_id = ${alias}.workspace_id
      AND latest_parse.media = ${alias}.media
      AND latest_parse.account_id = ${alias}.account_id)`;
}

const LABEL_BASIS_DATE_PARAMS: ReadonlySet<string> = new Set(["$4::date"]);

/**
 * v1.9.49 ①：某个业务日**可能**用到的候选行——那天生效的一行，或（该日早于所有行时）最早一行。
 * 只收窄候选、不做选择：选哪一行只由 domain 的 `pickAccountLabelBasis` 决定，SQL 里不写第二份规则。
 * 日期只收 `$4::date` 这一个占位符，值一律走参数。
 */
export function labelBasisCandidateSql(alias: ParseAlias, dateParam: "$4::date"): string {
  if (!PARSE_ALIASES.has(alias)) throw new Error("Invalid account name parse alias");
  if (!LABEL_BASIS_DATE_PARAMS.has(dateParam)) throw new Error("Invalid label basis date parameter");
  const same = `candidate.workspace_id = ${alias}.workspace_id AND candidate.media = ${alias}.media
      AND candidate.account_id = ${alias}.account_id`;
  return `${alias}.effective_from IN (
    (SELECT max(candidate.effective_from) FROM account_name_parses AS candidate WHERE ${same} AND candidate.effective_from <= ${dateParam}),
    (SELECT min(candidate.effective_from) FROM account_name_parses AS candidate WHERE ${same}))`;
}
