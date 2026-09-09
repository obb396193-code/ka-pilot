import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool } from "pg";

import { R014RepositoryError, approveAuth, requireTimestamp } from "./workspace-authority.js";

/**
 * v1.5 1.8 日报（D7）的读侧。
 *
 * 只算 canonical 里真有的：大盘六张卡、异常清单、健康度、送达态。
 * 维度模块的**行结构 fixture 没有冻**（rows 全是 []），本仓储不产出行——
 * 编一套行结构出来，等 arch 冻了就得推倒重来，而且前端会先按错的形状写。已回抛 arch。
 */
export interface DailyReportFacts {
  cards: {
    cost: number | null;
    cashCost: number | null;
    realConversion: number | null;
    costSpace: number | null;
    /** 分母 = 当日**可判定**的账户日（有现金消耗且有考核价），不是全部账户。 */
    onTargetAccounts: number | null;
    determinableAccounts: number;
  };
  anomalies: string[];
  /** 未处理工作项的最高等级，用来给健康度定档；没有未处理项就是 ok。 */
  highestOpenSeverity: "P0" | "P1" | "P2" | null;
  dataAsOf: string | null;
  delivery: { status: "not_sent" | "queued" | "sent" | "failed"; at: string | null; target: string | null };
}

export class DailyReportRepository {
  constructor(private readonly pool: Pool) {}

  async facts(auth: ApprovedWorkspaceAuthContext, date: string): Promise<DailyReportFacts> {
    const approved = approveAuth(auth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new R014RepositoryError("INVALID_INPUT");

    const cards = (await this.pool.query(
      `SELECT
         sum(cost) AS cost,
         sum(cash_cost) AS cash_cost,
         sum(real_conversion) AS real_conversion,
         sum(cost_space) AS cost_space,
         count(*) FILTER (
           WHERE cash_cost IS NOT NULL AND assessment_price_snapshot IS NOT NULL AND real_conversion IS NOT NULL
         )::int AS determinable,
         count(*) FILTER (
           WHERE cash_cost IS NOT NULL AND assessment_price_snapshot IS NOT NULL AND real_conversion IS NOT NULL
             AND cash_cost <= assessment_price_snapshot * real_conversion
         )::int AS on_target,
         max(computed_at) AS data_as_of
       FROM account_metrics_daily
       WHERE workspace_id=$1 AND ds=$2::date`,
      [approved.workspaceId, date],
    )).rows[0] as Record<string, unknown>;

    const anomalies = await this.pool.query(
      `SELECT COALESCE(title, '工作项') AS title, severity FROM work_items
       WHERE workspace_id=$1 AND status='open'
       ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, created_at DESC
       LIMIT 10`,
      [approved.workspaceId],
    );

    const determinable = Number(cards.determinable);
    return {
      cards: {
        cost: cards.cost === null ? null : Number(cards.cost),
        cashCost: cards.cash_cost === null ? null : Number(cards.cash_cost),
        realConversion: cards.real_conversion === null ? null : Number(cards.real_conversion),
        costSpace: cards.cost_space === null ? null : Number(cards.cost_space),
        // 一个可判定的都没有时，达标率是「算不出来」而不是 0。
        onTargetAccounts: determinable === 0 ? null : Number(cards.on_target),
        determinableAccounts: determinable,
      },
      // 异常措辞直接用工作项标题，**不另外生成一句话**。
      anomalies: (anomalies.rows as Record<string, unknown>[]).map((row) =>
        row.severity === null ? String(row.title) : `${String(row.title)}（${String(row.severity)}）`),
      highestOpenSeverity: ((anomalies.rows[0] as Record<string, unknown> | undefined)?.severity ?? null) as
        DailyReportFacts["highestOpenSeverity"],
      dataAsOf: cards.data_as_of === null ? null : requireTimestamp(cards.data_as_of).toISOString(),
      delivery: await this.delivery(approved, date),
    };
  }

  /**
   * v1.7.4 G8：送达态取指向该 `report_run` 的最新一条出站消息。
   * `outbound_messages` 没有 `ref` 列，关联写在 `payload.reportRunId` 里（实测表结构如此）。
   * 没有 run 或没有消息 → `not_sent`。**不拿「早报已生成」当「已送达」。**
   */
  private async delivery(auth: ApprovedWorkspaceAuthContext, date: string): Promise<DailyReportFacts["delivery"]> {
    const run = (await this.pool.query(
      `SELECT id FROM report_runs
       WHERE workspace_id=$1 AND kind='daily_brief' AND ref=$2::jsonb
         AND (user_id=$3 OR user_id IS NULL)
       ORDER BY user_id NULLS LAST LIMIT 1`,
      [auth.workspaceId, JSON.stringify({ date }), auth.userId],
    )).rows[0] as { id: string } | undefined;
    if (run === undefined) return { status: "not_sent", at: null, target: null };

    const message = (await this.pool.query(
      `SELECT status, sent_at, target FROM outbound_messages
       WHERE workspace_id=$1 AND payload->>'reportRunId' = $2
       ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 1`,
      [auth.workspaceId, run.id],
    )).rows[0] as Record<string, unknown> | undefined;
    if (message === undefined) return { status: "not_sent", at: null, target: null };

    const status = String(message.status);
    const mapped = status === "sent" ? "sent" : status === "failed" || status === "dead" ? "failed" : "queued";
    return {
      status: mapped,
      at: mapped === "sent" && message.sent_at !== null ? requireTimestamp(message.sent_at).toISOString() : null,
      target: (message.target as string | null) ?? null,
    };
  }
}
