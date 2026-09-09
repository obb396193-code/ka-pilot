import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, requireTimestamp, workItemScopeClause,
} from "./workspace-authority.js";

/**
 * v1.5 1.8 日报（D7）的读侧。
 *
 * 只算 canonical 里真有的：大盘六张卡、异常清单、七日趋势、三个维度模块的行、
 * 健康度、送达态。
 *
 * **一切读都按会话账户 scope 收口**（与任务详情 Q-020、任务列表同一个谓词）：
 * 个人空间只算自己有效授权的账户，团队空间只读全量不收口。原来这里是按 workspace
 * 全量聚的——那等于把整个空间的消耗摊给每个优化师看，和 Q-020 是同一类漏检。
 */
/** 维度行 = `account.dimension/v3` 行结构（v1.9.2 裁决：复用不另造）。 */
export interface DailyDimensionRow {
  key: string;
  label: string;
  media?: string;
  accountId?: string;
  metrics: {
    cost: number | null; cashCost: number | null; exposure: number | null; click: number | null;
    conversion: number | null; realConversion: number | null; costSpace: number | null;
  };
  /** 该行当日的考核价（取组内最新一版）；没有就是 null，达标与否随之「不知道」。 */
  price: number | null;
  priceEffectiveDate: string | null;
}

export interface DailyTrendPoint {
  ds: string;
  metrics: { cost: number | null; cashCost: number | null; realConversion: number | null };
}

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
  /** 截至 date 的 7 个点（v1.9.2 F-Q019-3）：**缺数日出 null，不跳日也不补 0**。 */
  trend: DailyTrendPoint[];
  /** 三个有源的维度模块的行；其余维度另有源或未接。 */
  dimensions: { task: DailyDimensionRow[]; biz: DailyDimensionRow[]; account: DailyDimensionRow[] };
  /** 每个账户当日绑定任务的业务名（F-Q023-1 归属链的第一跳）；任务没填就没有这一项。 */
  bizByAccount: Record<string, string>;
  /** 未处理工作项的最高等级，用来给健康度定档；没有未处理项就是 ok。 */
  highestOpenSeverity: "P0" | "P1" | "P2" | null;
  dataAsOf: string | null;
  delivery: { status: "not_sent" | "queued" | "sent" | "failed"; at: string | null; target: string | null };
}

/** 与 `task-list-sql.ts` / 任务详情同源的授权谓词。$3=scope kind，$4=allowed tuples。 */
const SCOPED_METRIC = `($3::text = 'team_workspace_readonly' OR EXISTS (
  SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS allowed(media text, account_id text)
  WHERE allowed.media=metric.media AND allowed.account_id=metric.account_id))`;

interface DailyScope { kind: string; allowed: string }

export class DailyReportRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * F-Q019-3：截至 date 的 7 个点。**缺数日出 null 不跳日**——
   * 跳日会让折线把两个不相邻的日子连成一段，看着像"那天有量"。
   */
  private async trend(workspaceId: string, date: string, scope: DailyScope): Promise<DailyTrendPoint[]> {
    const rows = (await this.pool.query(
      `SELECT to_char(day.ds, 'YYYY-MM-DD') AS ds,
              sum(metric.cost) AS cost, sum(metric.cash_cost) AS cash_cost,
              sum(metric.real_conversion) AS real_conversion
       FROM generate_series($2::date - INTERVAL '6 days', $2::date, INTERVAL '1 day') AS day(ds)
       LEFT JOIN account_metrics_daily AS metric
         ON metric.workspace_id=$1 AND metric.ds=day.ds AND ${SCOPED_METRIC}
       GROUP BY day.ds ORDER BY day.ds`,
      [workspaceId, date, scope.kind, scope.allowed],
    )).rows as Record<string, unknown>[];
    return rows.map((row) => ({
      ds: String(row.ds),
      metrics: {
        cost: row.cost === null ? null : Number(row.cost),
        cashCost: row.cash_cost === null ? null : Number(row.cash_cost),
        realConversion: row.real_conversion === null ? null : Number(row.real_conversion),
      },
    }));
  }

  /**
   * F-Q023-1：账户 → 绑定任务 → `tasks.biz_name`。这是 v1.4 的归属链第一跳；
   * 任务没填 biz_name 时由调用方回落到昵称解析的业务段，都没有才「未标注业务」。
   */
  private async bizByAccount(
    workspaceId: string, date: string, scope: DailyScope,
  ): Promise<Record<string, string>> {
    const rows = (await this.pool.query(
      `SELECT DISTINCT metric.media, metric.account_id, task.biz_name
       FROM account_metrics_daily AS metric
       JOIN task_accounts AS link ON link.workspace_id=metric.workspace_id
         AND link.media=metric.media AND link.account_id=metric.account_id
         AND link.valid_from <= metric.ds AND (link.valid_to IS NULL OR link.valid_to >= metric.ds)
       JOIN tasks AS task ON task.workspace_id=link.workspace_id AND task.task_id=link.task_id
       WHERE metric.workspace_id=$1 AND metric.ds=$2::date AND ${SCOPED_METRIC}
         AND task.biz_name IS NOT NULL`,
      [workspaceId, date, scope.kind, scope.allowed],
    )).rows as Record<string, unknown>[];
    return Object.fromEntries(rows.map((row) =>
      [`${String(row.media)}:${String(row.account_id)}`, String(row.biz_name)]));
  }

  /**
   * v1.9.2：三个有源的维度模块从 canonical 日表按维度聚合（与六卡同源），
   * **不调 Codex 的查询接口**。任务名/业务名/账户名取不到时用 key 兜底，不留空 label。
   */
  private async dimensionRows(
    workspaceId: string, date: string, scope: DailyScope,
  ): Promise<DailyReportFacts["dimensions"]> {
    const metricColumns = `sum(metric.cost) AS cost, sum(metric.cash_cost) AS cash_cost,
      sum(metric.exposure) AS exposure, sum(metric.click) AS click,
      sum(metric.conversion) AS conversion, sum(metric.real_conversion) AS real_conversion,
      sum(metric.cost_space) AS cost_space,
      max(metric.assessment_price_snapshot) AS price`;
    const params = [workspaceId, date, scope.kind, scope.allowed];

    const account = (await this.pool.query(
      `SELECT metric.media, metric.account_id, COALESCE(account.account_name, metric.account_id) AS label,
              ${metricColumns}
       FROM account_metrics_daily AS metric
       LEFT JOIN accounts AS account ON account.workspace_id=metric.workspace_id
         AND account.media=metric.media AND account.account_id=metric.account_id
       WHERE metric.workspace_id=$1 AND metric.ds=$2::date AND ${SCOPED_METRIC}
       GROUP BY metric.media, metric.account_id, account.account_name
       ORDER BY sum(metric.cost) DESC NULLS LAST, metric.account_id`,
      params,
    )).rows as Record<string, unknown>[];

    // 任务与业务都经 task_accounts 归集：一个账户当日可能挂在某个任务下。
    const byTask = (await this.pool.query(
      `SELECT link.task_id, COALESCE(task.task_name, link.task_id) AS label, ${metricColumns}
       FROM account_metrics_daily AS metric
       JOIN task_accounts AS link ON link.workspace_id=metric.workspace_id
         AND link.media=metric.media AND link.account_id=metric.account_id
         AND link.valid_from <= metric.ds AND (link.valid_to IS NULL OR link.valid_to >= metric.ds)
       LEFT JOIN tasks AS task ON task.workspace_id=link.workspace_id AND task.task_id=link.task_id
       WHERE metric.workspace_id=$1 AND metric.ds=$2::date AND ${SCOPED_METRIC}
       GROUP BY link.task_id, task.task_name
       ORDER BY sum(metric.cost) DESC NULLS LAST, link.task_id`,
      params,
    )).rows as Record<string, unknown>[];

    const byBiz = (await this.pool.query(
      `SELECT COALESCE(task.biz_name, '未标注业务') AS biz, ${metricColumns}
       FROM account_metrics_daily AS metric
       JOIN task_accounts AS link ON link.workspace_id=metric.workspace_id
         AND link.media=metric.media AND link.account_id=metric.account_id
         AND link.valid_from <= metric.ds AND (link.valid_to IS NULL OR link.valid_to >= metric.ds)
       LEFT JOIN tasks AS task ON task.workspace_id=link.workspace_id AND task.task_id=link.task_id
       WHERE metric.workspace_id=$1 AND metric.ds=$2::date AND ${SCOPED_METRIC}
       GROUP BY COALESCE(task.biz_name, '未标注业务')
       ORDER BY sum(metric.cost) DESC NULLS LAST, 1`,
      params,
    )).rows as Record<string, unknown>[];

    const metricsOf = (row: Record<string, unknown>): DailyDimensionRow["metrics"] => ({
      cost: row.cost === null ? null : Number(row.cost),
      cashCost: row.cash_cost === null ? null : Number(row.cash_cost),
      exposure: row.exposure === null ? null : Number(row.exposure),
      click: row.click === null ? null : Number(row.click),
      conversion: row.conversion === null ? null : Number(row.conversion),
      realConversion: row.real_conversion === null ? null : Number(row.real_conversion),
      costSpace: row.cost_space === null ? null : Number(row.cost_space),
    });
    const priceOf = (row: Record<string, unknown>): { price: number | null; priceEffectiveDate: string | null } => ({
      price: row.price === null || row.price === undefined ? null : Number(row.price),
      // 快照价没有独立生效日；日报口径就是「当日那一版」，用业务日本身，不编一个更早的日期。
      priceEffectiveDate: row.price === null || row.price === undefined ? null : date,
    });

    return {
      account: account.map((row) => ({
        key: `${String(row.media)}:${String(row.account_id)}`,
        label: String(row.label),
        media: String(row.media),
        accountId: String(row.account_id),
        metrics: metricsOf(row), ...priceOf(row),
      })),
      task: byTask.map((row) => ({
        key: String(row.task_id), label: String(row.label), metrics: metricsOf(row), ...priceOf(row),
      })),
      biz: byBiz.map((row) => ({
        key: String(row.biz), label: String(row.biz), metrics: metricsOf(row), ...priceOf(row),
      })),
    };
  }

  async facts(auth: ApprovedWorkspaceAuthContext, date: string): Promise<DailyReportFacts> {
    const approved = approveAuth(auth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new R014RepositoryError("INVALID_INPUT");

    const scope = {
      kind: approved.scope.kind,
      allowed: JSON.stringify(approved.scope.kind === "explicit_accounts"
        ? approved.scope.accounts.map((account) => ({ media: account.media, account_id: account.accountId }))
        : []),
    };

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
       FROM account_metrics_daily AS metric
       WHERE metric.workspace_id=$1 AND metric.ds=$2::date AND ${SCOPED_METRIC}`,
      [approved.workspaceId, date, scope.kind, scope.allowed],
    )).rows[0] as Record<string, unknown>;

    const anomalies = await this.pool.query(
      `SELECT COALESCE(title, '工作项') AS title, severity FROM work_items
       WHERE workspace_id=$1 AND status='open'
         AND ${workItemScopeClause("$2", "$3", "work_items", "$4")}
       ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, created_at DESC
       LIMIT 10`,
      [approved.workspaceId, scope.kind, scope.allowed, approved.userId],
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
      trend: await this.trend(approved.workspaceId, date, scope),
      dimensions: await this.dimensionRows(approved.workspaceId, date, scope),
      bizByAccount: await this.bizByAccount(approved.workspaceId, date, scope),
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
