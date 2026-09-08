import {
  alertRuleScopeSchema, boundRuleSchema, boundWorkflowSchema, ruleScopeBinding, sopProgress,
  taskBindingsSchema, type ApprovedWorkspaceAuthContext, type TaskBindings, type TaskScopeFacts,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014RepositoryError, approveAuth, requireOwnWorkspace, requireTimestamp } from "./workspace-authority.js";

/**
 * v1.7.3 `GET /tasks/:id/bindings`。
 * - 规则：`alert_rules.scope` 按 v1.9 ⑨ 的结构判绑定层级；**全局规则不算绑定**。
 * - 工作流：库里没有「定义↔任务」的绑定表，唯一可靠的联系是 `workflow_runs.task_id`（我的 015 列），
 *   所以「绑在本任务上的工作流」= 为本任务跑过 run 的那些定义。这是推导不是发明，已在回执说明。
 * - SOP：`tasks.sop_run_id` → run → version → 定义名；进度 = 成功节点数 / 图上节点数。
 * - `boundAt`：`alert_rules.bound_at` 是 018 的列，落地前恒 null，不拿别的时间冒充。
 */
export class TaskBindingsRepository {
  constructor(private readonly pool: Pool) {}

  async bindings(auth: ApprovedWorkspaceAuthContext, taskId: string): Promise<TaskBindings> {
    const approved = approveAuth(auth);
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const task = await this.taskFacts(approved.workspaceId, taskId);
    return taskBindingsSchema.parse({
      taskId,
      rules: await this.rules(approved.workspaceId, task),
      workflows: await this.workflows(approved.workspaceId, taskId),
      sop: await this.sop(approved.workspaceId, taskId),
    });
  }

  private async taskFacts(workspaceId: string, taskId: string): Promise<TaskScopeFacts> {
    const task = await this.pool.query(
      "SELECT workspace_id, biz_name FROM tasks WHERE workspace_id=$1 AND task_id=$2",
      [workspaceId, taskId],
    );
    if (task.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
    requireOwnWorkspace(task.rows[0] as Record<string, unknown>, workspaceId);
    const accounts = await this.pool.query(
      "SELECT DISTINCT media, account_id FROM task_accounts WHERE workspace_id=$1 AND task_id=$2",
      [workspaceId, taskId],
    );
    return {
      taskId,
      bizName: ((task.rows[0] as Record<string, unknown>).biz_name as string | null) ?? null,
      accounts: (accounts.rows as Record<string, unknown>[]).map((row) => ({
        media: String(row.media), accountId: String(row.account_id),
      })),
    };
  }

  private async rules(workspaceId: string, task: TaskScopeFacts): Promise<unknown[]> {
    const hasBoundAt = (await this.pool.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema='public' AND table_name='alert_rules' AND column_name='bound_at'`,
    )).rows[0].n === 1;
    const result = await this.pool.query(
      `SELECT id, name, rule_type, enabled, autonomy_level, scope${hasBoundAt ? ", bound_at" : ""}
       FROM alert_rules WHERE workspace_id=$1 ORDER BY id`,
      [workspaceId],
    );
    const bound: unknown[] = [];
    for (const row of result.rows as Record<string, unknown>[]) {
      const scope = alertRuleScopeSchema.safeParse(row.scope ?? {});
      // scope 结构不认识就当没绑，不猜——猜错会让规则凭空出现在某个任务上。
      if (!scope.success) continue;
      const level = ruleScopeBinding(scope.data, task);
      if (level === null) continue;
      bound.push(boundRuleSchema.parse({
        ruleId: Number(row.id),
        name: String(row.name),
        type: (row.rule_type as string | null) ?? null,
        enabled: row.enabled !== false,
        autonomyLevel: Number(row.autonomy_level ?? 1),
        scope: level,
        boundAt: hasBoundAt && row.bound_at !== null && row.bound_at !== undefined
          ? requireTimestamp(row.bound_at).toISOString()
          : null,
      }));
    }
    return bound;
  }

  private async workflows(workspaceId: string, taskId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT ON (definition.id)
         definition.id AS workflow_id, definition.name, version.version, version.status,
         run.id AS run_id, run.status AS run_status, run.started_at
       FROM workflow_runs AS run
       JOIN workflow_versions AS version ON version.id=run.version_id AND version.workspace_id=run.workspace_id
       JOIN workflow_definitions AS definition ON definition.id=version.definition_id
         AND definition.workspace_id=version.workspace_id
       WHERE run.workspace_id=$1 AND run.task_id=$2
       ORDER BY definition.id, run.started_at DESC`,
      [workspaceId, taskId],
    );
    return (result.rows as Record<string, unknown>[]).map((row) => boundWorkflowSchema.parse({
      workflowId: String(row.workflow_id),
      name: String(row.name),
      version: Number(row.version),
      status: String(row.status ?? "draft"),
      scope: "task",
      lastRun: row.run_id === null || row.started_at === null ? null : {
        runId: String(row.run_id),
        status: (row.run_status as string | null) ?? null,
        at: requireTimestamp(row.started_at).toISOString(),
      },
    }));
  }

  private async sop(workspaceId: string, taskId: string): Promise<unknown | null> {
    const result = await this.pool.query(
      `SELECT run.id AS run_id, definition.name AS template, version.graph
       FROM tasks AS task
       JOIN workflow_runs AS run ON run.id=task.sop_run_id AND run.workspace_id=task.workspace_id
       JOIN workflow_versions AS version ON version.id=run.version_id AND version.workspace_id=run.workspace_id
       JOIN workflow_definitions AS definition ON definition.id=version.definition_id
         AND definition.workspace_id=version.workspace_id
       WHERE task.workspace_id=$1 AND task.task_id=$2 AND task.sop_run_id IS NOT NULL`,
      [workspaceId, taskId],
    );
    if (result.rows.length !== 1) return null;
    const row = result.rows[0] as Record<string, unknown>;
    const graph = row.graph as { nodes?: unknown[] } | null;
    const totalNodes = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
    const succeeded = (await this.pool.query(
      `SELECT count(DISTINCT node_id)::int AS n FROM workflow_run_events
       WHERE run_id=$1 AND event='node_succeeded' AND node_id IS NOT NULL`,
      [row.run_id],
    )).rows[0].n as number;
    return {
      sopRunId: String(row.run_id),
      template: String(row.template),
      progress: sopProgress(succeeded, totalNodes),
    };
  }
}
