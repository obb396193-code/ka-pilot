import { accountDayCostSchema, type AccountDayCost } from "@ka/domain";

import { etlBatchReadableSql } from "./etl-batch-readability.js";
import type { SemanticReadConnection } from "./semantic-read-snapshot.js";

/**
 * v1.9.27 ④（be2 Q-041 ①）：级联选项要按「窗口内花了多少」排序并只列 cost>0，
 * 所以要一份**账户×天的花费**。
 *
 * 三条口径：
 * - 只读**已批准的 tuple**，账户集合由调用方从会话 scope 给，绝不从浏览器参数取；
 * - 失败批次的旧 canonical **不算数**（复用 Q-037 的共享守卫）——拿失败那天的旧花费
 *   去决定「这个选项列不列」，等于用过期数据替用户做选择；
 * - 取不到的天回 `null`，**不是 0**：分组时缺失的天不计入求和，也不当没花钱。
 */
const MAX_ROWS = 10_000;

export class DashboardAccountCostRepository {
  constructor(private readonly connection: SemanticReadConnection) {}

  async load(input: {
    workspaceId: string;
    accounts: readonly { media: string; accountId: string }[];
    dateFrom: string;
    dateTo: string;
  }): Promise<AccountDayCost[]> {
    if (input.accounts.length === 0) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo)) {
      throw new Error("Invalid dashboard cost window");
    }
    const { rows } = await this.connection.query(`/* dashboard-account-cost */
      SELECT metric.media, metric.account_id, to_char(metric.ds,'YYYY-MM-DD') AS ds, metric.cost
      FROM jsonb_to_recordset($2::jsonb) AS wanted(media text, "accountId" text)
      JOIN account_metrics_daily AS metric
        ON metric.workspace_id=$1 AND metric.media=wanted.media AND metric.account_id=wanted."accountId"
       AND metric.ds BETWEEN $3::date AND $4::date
       AND ${etlBatchReadableSql("metric")}
      ORDER BY metric.media COLLATE "C", metric.account_id COLLATE "C", metric.ds
      LIMIT ${MAX_ROWS + 1}`,
    [input.workspaceId, JSON.stringify(input.accounts.map((account) => ({
      media: account.media, accountId: account.accountId,
    }))), input.dateFrom, input.dateTo]);
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
      // 超界就明说，不截断后当成完整结果——截断过的选项表会少列几个真花了钱的项。
      throw new Error("Dashboard cost window exceeds the bounded row budget");
    }
    const allowed = new Set(input.accounts.map((account) => JSON.stringify([account.media, account.accountId])));
    return rows.map((row) => {
      const parsed = accountDayCostSchema.parse({
        media: row?.media, accountId: row?.account_id, ds: row?.ds,
        cost: row?.cost === null || row?.cost === undefined ? null : Number(row.cost),
      });
      if (!allowed.has(JSON.stringify([parsed.media, parsed.accountId]))) {
        throw new Error("Dashboard cost returned an unapproved account");
      }
      return parsed;
    });
  }
}
