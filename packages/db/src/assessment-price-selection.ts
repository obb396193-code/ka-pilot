/**
 * 考核价「当前生效段」的唯一判定（契约 v1.9.28 / be2 Q-043 ④）。
 *
 * 规则：取 `effective_date <= D` 的**最近一条未作废**段。作废用只增不改的
 * `op='revoke'` 行表示，它作废**同一生效日**的整段。
 *
 * 为什么收在一处：这条判定散在六个读点上（任务列表 / 窗口考核 / 透视 / 指标补价 /
 * 任务详情 / 改价前的旧价对照）。少改一处，那一处就会拿已经作废的价继续算钱——
 * 而且算出来的数看着完全正常，没有任何报错。授权谓词那次的教训是一样的：
 * 同一段 SQL 抄六份，迟早有一份漂掉。绊线 `assessment-price-selection.test.ts` 扫全仓。
 */

/** 未作废：这一行的生效日上没有 revoke 行。`alias` 是被判定的那张 `assessment_price_history` 的别名。 */
export function assessmentPriceNotRevokedSql(alias: string): string {
  return `${alias}.op = 'set' AND NOT EXISTS (
    SELECT 1 FROM assessment_price_history AS revoked
    WHERE revoked.workspace_id = ${alias}.workspace_id
      AND revoked.task_id = ${alias}.task_id
      AND revoked.op = 'revoke'
      AND revoked.effective_date = ${alias}.effective_date)`;
}

/**
 * 一整条「取当前生效段」的 WHERE 片段：日期上界 + 未作废。
 * `dateExpression` 是业务日表达式（`$3::date` / `metric.ds` / `expected.ds` 都可以）。
 */
export function assessmentPriceEffectiveSql(alias: string, dateExpression: string): string {
  return `${alias}.effective_date <= ${dateExpression} AND ${assessmentPriceNotRevokedSql(alias)}`;
}

/** 排序：同一生效日有多行时以 id 大者为准（只增不改，后写的是新结论）。 */
export const ASSESSMENT_PRICE_ORDER = "effective_date DESC, id DESC";
