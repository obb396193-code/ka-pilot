import {
  deriveSystemReadiness, mergeReadiness, overallReadiness, taskStageSchema, taskStageSourceSchema,
  type ApprovedWorkspaceAuthContext, type ReadinessDimension, type TaskReadinessFacts,
  type TaskStage, type TaskStageSource,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014RepositoryError, approveAuth, requireOwnWorkspace, requireTimestamp } from "./workspace-authority.js";

/**
 * v1.5.1 ② 任务详情（D5）的读侧。
 *
 * 只取库里真有的事实；窗口口径（cost/costStatus/onTarget）与日预算卡三项**本仓储不产出**——
 * 前者要 `PlatformWindowQuery`（R-010a1，Codex），后者要 `task_budget_history`（014）。
 * 服务层把它们置 null，不在这里凑数。
 */
export interface TaskDetailFacts {
  task: {
    taskId: string;
    taskName: string | null;
    bizName: string | null;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    owner: { userId: string; displayName: string } | null;
    budget: number | null;
    targetVolume: number | null;
  };
  completedVolume: number | null;
  recentDailyVolumes: number[];
  anomalySummary: { p0: number; p1: number; opportunity: number };
  assessmentPrice: { current: number; effectiveDate: string; historyCount: number } | null;
  // 类型跟着 schema 走：仓储已经用 taskStageSchema 校验过，调用方不该再断言一次。
  stage: { value: TaskStage; source: TaskStageSource; changedAt: string | null };
  sopRunId: string | null;
  readinessFacts: TaskReadinessFacts;
  readinessOverrides: { dimension: ReadinessDimension; ready: boolean }[];
  /** 真实存在的阻塞项：open 工作项 + 就绪度缺项。**不生成**（v1.5.1 ② 明写）。 */
  openWorkItems: { id: string; title: string; severity: string | null }[];
}

const SEVERITY_KEYS = ["P0", "P1", "opportunity"] as const;

/**
 * Q-020：详情必须和任务列表**同一口径**——列表里看不见的任务，详情也不能有。
 * 谓词与 `task-list-sql.ts` 同源：团队空间是只读全量不收口，个人空间必须命中
 * 会话 scope 里的 (media, account_id)。scope 由会话解析时按 live 授权重算
 * （`auth-repository.ts` 已排除 `revoked_at` 非空的审计行），所以撤权下一次请求即生效。
 */
interface TaskScope { kind: string; allowed: string }

function allowedTuple(kindParam: string, listParam: string, media: string, accountId: string): string {
  return `(${kindParam}::text = 'team_workspace_readonly' OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(${listParam}::jsonb) AS allowed(media text, account_id text)
    WHERE allowed.media = ${media} AND allowed.account_id = ${accountId}))`;
}

export class TaskDetailRepository {
  constructor(private readonly pool: Pool) {}

  async facts(auth: ApprovedWorkspaceAuthContext, taskId: string, businessDate: string): Promise<TaskDetailFacts> {
    const approved = approveAuth(auth);
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new R014RepositoryError("INVALID_INPUT");

    const scope: TaskScope = {
      kind: approved.scope.kind,
      allowed: JSON.stringify(approved.scope.kind === "explicit_accounts"
        ? approved.scope.accounts.map((account) => ({ media: account.media, account_id: account.accountId }))
        : []),
    };

    const taskRow = (await this.pool.query(
      `SELECT task.workspace_id, task.task_id, task.task_name, task.biz_name,
              COALESCE(task.status, 'active') AS status,
              to_char(task.period_start, 'YYYY-MM-DD') AS period_start,
              to_char(task.period_end, 'YYYY-MM-DD') AS period_end,
              task.target_volume, task.budget,
              task.stage, task.stage_source, task.stage_changed_at, task.sop_run_id,
              task.owner_user_id, owner.name AS owner_name
       FROM tasks AS task
       LEFT JOIN users AS owner ON owner.workspace_id=task.workspace_id AND owner.id=task.owner_user_id
       WHERE task.workspace_id=$1 AND task.task_id=$2
         AND ($3::text = 'team_workspace_readonly' OR EXISTS (
           SELECT 1 FROM task_accounts AS relation
           JOIN jsonb_to_recordset($4::jsonb) AS allowed(media text, account_id text)
             ON allowed.media=relation.media AND allowed.account_id=relation.account_id
           WHERE relation.workspace_id=task.workspace_id AND relation.task_id=task.task_id
             AND relation.valid_from <= $5::date
             AND (relation.valid_to IS NULL OR relation.valid_to >= $5::date)))`,
      [approved.workspaceId, taskId, scope.kind, scope.allowed, businessDate],
    )).rows[0] as Record<string, unknown> | undefined;
    // 一个账户都没授权到的任务 → 404 而不是 403：403 等于确认「这个任务存在」。
    if (taskRow === undefined) throw new R014RepositoryError("NOT_FOUND");
    requireOwnWorkspace(taskRow, approved.workspaceId);

    const stage = taskStageSchema.safeParse(taskRow.stage ?? "preparing");
    const stageSource = taskStageSourceSchema.safeParse(taskRow.stage_source ?? "system");
    if (!stage.success || !stageSource.success) throw new R014RepositoryError("INVALID_RESULT");

    const [readiness, volumes, anomalies, assessment, overrides, workItems] = await Promise.all([
      this.readinessFacts(approved.workspaceId, taskId, businessDate, scope),
      this.volumes(approved.workspaceId, taskId, businessDate, scope),
      this.anomalySummary(approved.workspaceId, taskId, scope),
      this.assessmentPrice(approved.workspaceId, taskId, businessDate),
      this.readinessOverrides(approved.workspaceId, taskId),
      this.openWorkItems(approved.workspaceId, taskId, scope),
    ]);

    return {
      task: {
        taskId,
        taskName: (taskRow.task_name as string | null) ?? null,
        bizName: (taskRow.biz_name as string | null) ?? null,
        status: String(taskRow.status),
        periodStart: (taskRow.period_start as string | null) ?? null,
        periodEnd: (taskRow.period_end as string | null) ?? null,
        owner: taskRow.owner_user_id === null || taskRow.owner_name === null
          ? null
          : { userId: String(taskRow.owner_user_id), displayName: String(taskRow.owner_name) },
        budget: taskRow.budget === null ? null : Number(taskRow.budget),
        targetVolume: taskRow.target_volume === null ? null : Number(taskRow.target_volume),
      },
      completedVolume: volumes.completed,
      recentDailyVolumes: volumes.recent,
      anomalySummary: anomalies,
      assessmentPrice: assessment,
      stage: {
        value: stage.data,
        source: stageSource.data,
        changedAt: taskRow.stage_changed_at === null ? null : requireTimestamp(taskRow.stage_changed_at).toISOString(),
      },
      sopRunId: (taskRow.sop_run_id as string | null) ?? null,
      readinessFacts: readiness,
      readinessOverrides: overrides,
      openWorkItems: workItems,
    };
  }

  private async readinessFacts(
    workspaceId: string, taskId: string, businessDate: string, scope: TaskScope,
  ): Promise<TaskReadinessFacts> {
    const row = (await this.pool.query(
      `SELECT
         count(*)::int AS account_count,
         count(*) FILTER (WHERE COALESCE(balance.balance, 0) > 0)::int AS recharged_count,
         count(*) FILTER (WHERE unit.account_id IS NOT NULL)::int AS built_count,
         COALESCE(array_remove(array_agg(link.account_id ORDER BY link.account_id)
           FILTER (WHERE COALESCE(balance.balance, 0) <= 0), NULL), ARRAY[]::text[]) AS unfunded,
         COALESCE(array_remove(array_agg(link.account_id ORDER BY link.account_id)
           FILTER (WHERE unit.account_id IS NULL), NULL), ARRAY[]::text[]) AS unbuilt
       FROM (
         SELECT DISTINCT account_task.media, account_task.account_id
         FROM task_accounts AS account_task
         WHERE account_task.workspace_id=$1 AND account_task.task_id=$2
           AND account_task.valid_from <= $3::date
           AND (account_task.valid_to IS NULL OR account_task.valid_to >= $3::date)
           -- 就绪度分母也只数授权账户：否则「10 个户建好 3 个」里有 7 个是他看不到的。
           AND ($4::text = 'team_workspace_readonly' OR EXISTS (
             SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS allowed(media text, account_id text)
             WHERE allowed.media=account_task.media AND allowed.account_id=account_task.account_id))
       ) AS link
       LEFT JOIN account_balance AS balance
         ON balance.workspace_id=$1 AND balance.media=link.media AND balance.account_id=link.account_id
       LEFT JOIN LATERAL (
         SELECT entity.account_id FROM ad_entities AS entity
         WHERE entity.workspace_id=$1 AND entity.media=link.media
           AND entity.account_id=link.account_id AND entity.entity_type='unit'
         LIMIT 1
       ) AS unit ON true`,
      [workspaceId, taskId, businessDate, scope.kind, scope.allowed],
    )).rows[0] as Record<string, unknown>;
    return {
      accountCount: Number(row.account_count),
      rechargedCount: Number(row.recharged_count),
      builtCount: Number(row.built_count),
      unfundedAccounts: (row.unfunded as string[]) ?? [],
      unbuiltAccounts: (row.unbuilt as string[]) ?? [],
    };
  }

  private async volumes(workspaceId: string, taskId: string, businessDate: string, scope: TaskScope):
  Promise<{ completed: number | null; recent: number[] }> {
    const row = (await this.pool.query(
      `SELECT
         (SELECT sum(metric.real_conversion) FROM account_metrics_daily AS metric
          JOIN task_accounts AS link ON link.workspace_id=metric.workspace_id
            AND link.media=metric.media AND link.account_id=metric.account_id
            AND link.task_id=$2 AND link.valid_from <= metric.ds
            AND (link.valid_to IS NULL OR link.valid_to >= metric.ds)
          WHERE metric.workspace_id=$1 AND metric.ds <= $3::date
            -- 达成量只算授权账户：混合媒体任务里，没授权的那部分不能计进他的完成数。
            AND ($4::text = 'team_workspace_readonly' OR EXISTS (
              SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS allowed(media text, account_id text)
              WHERE allowed.media=link.media AND allowed.account_id=link.account_id))) AS completed,
         COALESCE((SELECT array_agg(daily.total ORDER BY daily.ds)
          FROM (
            SELECT metric.ds, sum(metric.real_conversion)::float8 AS total
            FROM account_metrics_daily AS metric
            JOIN task_accounts AS link ON link.workspace_id=metric.workspace_id
              AND link.media=metric.media AND link.account_id=metric.account_id
              AND link.task_id=$2 AND link.valid_from <= metric.ds
              AND (link.valid_to IS NULL OR link.valid_to >= metric.ds)
            WHERE metric.workspace_id=$1 AND metric.ds <= $3::date
              AND metric.ds > $3::date - INTERVAL '7 days'
              AND ($4::text = 'team_workspace_readonly' OR EXISTS (
              SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS allowed(media text, account_id text)
              WHERE allowed.media=link.media AND allowed.account_id=link.account_id))
            GROUP BY metric.ds
          ) AS daily), ARRAY[]::float8[]) AS recent`,
      [workspaceId, taskId, businessDate, scope.kind, scope.allowed],
    )).rows[0] as Record<string, unknown>;
    return {
      completed: row.completed === null ? null : Number(row.completed),
      recent: ((row.recent as number[]) ?? []).map((value) => Number(value)),
    };
  }

  private async anomalySummary(workspaceId: string, taskId: string, scope: TaskScope):
  Promise<{ p0: number; p1: number; opportunity: number }> {
    const row = (await this.pool.query(
      `SELECT
         count(*) FILTER (WHERE severity='P0')::int AS p0,
         count(*) FILTER (WHERE severity='P1')::int AS p1,
         count(*) FILTER (WHERE severity='opportunity')::int AS opportunity
       FROM work_items
       WHERE workspace_id=$1 AND task_id=$2 AND status='open'
         -- 任务级工作项（account 为空）留下：任务本身已经过闸；账户级的按授权收口。
         AND ($3::text = 'team_workspace_readonly' OR account_id IS NULL OR EXISTS (
           SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS allowed(media text, account_id text)
           WHERE allowed.media=work_items.media AND allowed.account_id=work_items.account_id))`,
      [workspaceId, taskId, scope.kind, scope.allowed],
    )).rows[0] as Record<string, unknown>;
    return { p0: Number(row.p0), p1: Number(row.p1), opportunity: Number(row.opportunity) };
  }

  /** 展示价取业务日当天生效的最新一版；`historyCount` 是这个任务改过几次考核价。 */
  private async assessmentPrice(workspaceId: string, taskId: string, businessDate: string):
  Promise<{ current: number; effectiveDate: string; historyCount: number } | null> {
    const row = (await this.pool.query(
      `SELECT history.price, to_char(history.effective_date, 'YYYY-MM-DD') AS effective_date,
              (SELECT count(*)::int FROM assessment_price_history AS all_rows
               WHERE all_rows.workspace_id=$1 AND all_rows.task_id=$2) AS history_count
       FROM assessment_price_history AS history
       WHERE history.workspace_id=$1 AND history.task_id=$2 AND history.effective_date <= $3::date
       ORDER BY history.effective_date DESC, history.id DESC LIMIT 1`,
      [workspaceId, taskId, businessDate],
    )).rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) return null;
    return {
      current: Number(row.price),
      effectiveDate: String(row.effective_date),
      historyCount: Number(row.history_count),
    };
  }

  private async readinessOverrides(workspaceId: string, taskId: string):
  Promise<{ dimension: ReadinessDimension; ready: boolean }[]> {
    const result = await this.pool.query(
      "SELECT dimension, ready FROM task_readiness_overrides WHERE workspace_id=$1 AND task_id=$2 ORDER BY dimension",
      [workspaceId, taskId],
    );
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      dimension: String(row.dimension) as ReadinessDimension,
      ready: row.ready === true,
    }));
  }

  private async openWorkItems(workspaceId: string, taskId: string, scope: TaskScope):
  Promise<{ id: string; title: string; severity: string | null }[]> {
    const result = await this.pool.query(
      `SELECT id, COALESCE(title, '工作项') AS title, severity FROM work_items
       WHERE workspace_id=$1 AND task_id=$2 AND status='open'
         AND ($3::text = 'team_workspace_readonly' OR account_id IS NULL OR EXISTS (
           SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS allowed(media text, account_id text)
           WHERE allowed.media=work_items.media AND allowed.account_id=work_items.account_id))
       ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
                created_at DESC
       LIMIT 20`,
      [workspaceId, taskId, scope.kind, scope.allowed],
    );
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      severity: (row.severity as string | null) ?? null,
    }));
  }
}

/** 六段就绪度 + overall（详情级比列表级多这一项）。 */
export function buildTaskDetailReadiness(facts: TaskDetailFacts): ReturnType<typeof mergeReadiness> & {
  overall: ReturnType<typeof overallReadiness>;
} {
  const merged = mergeReadiness(deriveSystemReadiness(facts.readinessFacts), facts.readinessOverrides);
  return { ...merged, overall: overallReadiness(merged) };
}

/** severity 只用于排序展示，不参与判定；未知等级排最后。 */
export const WORK_ITEM_SEVERITY_ORDER = SEVERITY_KEYS;
