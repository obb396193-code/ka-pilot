import { taskManageFieldsSchema, type ApprovedWorkspaceAuthContext, type TaskManageFields } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import {
  R014RepositoryError, accountScopeParams, approveAuth, inTransaction, lockWorkspaceMembership,
  requireOwnWorkspace, taskGrantScopeClause,
} from "./workspace-authority.js";

/**
 * v1.9.28 任务管理视图的写侧（be2 Q-043 ②）。
 *
 * 两条端点共用同一段「校验 → 可见性 → 更新」：`PATCH /tasks/:id` 是它的一条，
 * `POST /tasks/batch-save` 是同一段在一个事务里跑 N 次。**不做两套**——
 * 两套写法必然在校验或授权上分叉，而分叉的那一边就是漏洞。
 */
export interface TaskManageRecord {
  taskId: string;
  taskName: string | null;
  bizName: string | null;
  status: string;
  aliases: string[];
  monitorUrl: string | null;
  productName: string | null;
}

export interface BatchSaveFailure {
  taskId: string;
  code: "INVALID_INPUT" | "NOT_FOUND";
  message: string;
}

const RETURNING = `task_id, task_name, biz_name, status, aliases, monitor_url, product_name`;

function mapTask(row: Record<string, unknown>): TaskManageRecord {
  return {
    taskId: String(row.task_id),
    taskName: (row.task_name as string | null) ?? null,
    bizName: (row.biz_name as string | null) ?? null,
    status: String(row.status),
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    monitorUrl: (row.monitor_url as string | null) ?? null,
    productName: (row.product_name as string | null) ?? null,
  };
}

/** 别名去重保序并去空：别名是用来匹配昵称的，重复项只会让最长命中多比几次。 */
function normalizeAliases(aliases: readonly string[]): string[] {
  return [...new Set(aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0))];
}

export class TaskManageRepository {
  constructor(private readonly pool: Pool) {}

  /** 单条更新。看不见的任务一律 404——403 等于确认「这个任务存在」。 */
  async patch(
    auth: ApprovedWorkspaceAuthContext,
    taskId: string,
    input: unknown,
    businessDate: string,
  ): Promise<TaskManageRecord> {
    const approved = approveAuth(auth);
    const fields = this.parseFields(input);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new R014RepositoryError("INVALID_INPUT");
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      return this.update(client, approved, taskId, fields, businessDate);
    });
  }

  /**
   * 整体保存。**全部成功才写**：任一条失败就整批回滚并把失败清单交出去
   * （契约 v1.9.28：400 带 `details.failed[]`）。
   * 逐条校验先跑完再写，这样失败清单是完整的一份，而不是「跑到第三条就停」。
   */
  async batchSave(
    auth: ApprovedWorkspaceAuthContext,
    items: readonly { task_id: string }[],
    businessDate: string,
  ): Promise<{ saved: TaskManageRecord[] } | { failed: BatchSaveFailure[] }> {
    const approved = approveAuth(auth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new R014RepositoryError("INVALID_INPUT");
    const seen = new Set<string>();
    const parsed: { taskId: string; fields: TaskManageFields }[] = [];
    const failed: BatchSaveFailure[] = [];
    for (const item of items) {
      const { task_id: taskId, ...rest } = item as { task_id: string } & Record<string, unknown>;
      if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
        failed.push({ taskId: String(taskId), code: "INVALID_INPUT", message: "task_id is required" });
        continue;
      }
      // 同一批里出现两次同一个任务：两条改的可能互相矛盾，写哪条都是猜。
      if (seen.has(taskId)) {
        failed.push({ taskId, code: "INVALID_INPUT", message: "duplicate task_id in the same batch" });
        continue;
      }
      seen.add(taskId);
      const candidate = taskManageFieldsSchema.safeParse(rest);
      if (!candidate.success) {
        failed.push({ taskId, code: "INVALID_INPUT", message: candidate.error.issues[0]?.message ?? "invalid fields" });
        continue;
      }
      parsed.push({ taskId, fields: candidate.data });
    }
    if (failed.length > 0) return { failed };

    try {
      return await inTransaction(this.pool, async (client) => {
        await lockWorkspaceMembership(client, approved);
        const saved: TaskManageRecord[] = [];
        for (const entry of parsed) {
          saved.push(await this.update(client, approved, entry.taskId, entry.fields, businessDate));
        }
        return { saved };
      });
    } catch (error) {
      // 看不见/不存在的任务在事务里抛 NOT_FOUND；整批回滚后按失败清单交出去，
      // 而不是把它当成一个笼统的 404 —— 调用方要知道是哪一条。
      if (error instanceof R014RepositoryError && error.code === "NOT_FOUND") {
        return { failed: [{ taskId: "", code: "NOT_FOUND", message: "one or more tasks are not visible" }] };
      }
      throw error;
    }
  }

  private parseFields(input: unknown): TaskManageFields {
    const candidate = taskManageFieldsSchema.safeParse(input);
    if (!candidate.success) throw new R014RepositoryError("INVALID_INPUT");
    return candidate.data;
  }

  /**
   * 真正的写。可见性与考核价改价同一口径：任务在业务日挂着至少一个授权账户才动得了它，
   * 团队空间（只读镜像）不许写。
   */
  private async update(
    client: Pick<PoolClient, "query">,
    approved: ApprovedWorkspaceAuthContext,
    taskId: string,
    fields: TaskManageFields,
    businessDate: string,
  ): Promise<TaskManageRecord> {
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    // 团队空间是 ka-data 的只读镜像，改了也不会回流到源，改的只是自己的幻觉。
    if (approved.workspaceKind === "team") throw new R014RepositoryError("FORBIDDEN");
    const scope = accountScopeParams(approved);
    const aliases = fields.aliases === undefined ? null : normalizeAliases(fields.aliases);
    const result = await client.query(
      `UPDATE tasks AS task SET
         aliases = COALESCE($4::text[], task.aliases),
         monitor_url = CASE WHEN $5::boolean THEN $6::text ELSE task.monitor_url END,
         product_name = CASE WHEN $7::boolean THEN $8::text ELSE task.product_name END,
         status = COALESCE($9::text, task.status)
       WHERE task.workspace_id=$1 AND task.task_id=$2
         AND ${taskGrantScopeClause("$3", "$10", "task", "$11")}
       RETURNING task.workspace_id, ${RETURNING}`,
      [
        approved.workspaceId, taskId, scope.kind, aliases,
        // 监测链接/产品名可以被显式清空（null）：所以「给没给」与「给的是不是 null」要分开传，
        // 不然 COALESCE 会把「清空」当成「没改」。
        fields.monitor_url !== undefined, fields.monitor_url ?? null,
        fields.product_name !== undefined, fields.product_name ?? null,
        fields.status ?? null, scope.allowed, businessDate,
      ],
    );
    if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
    const row = result.rows[0] as Record<string, unknown>;
    requireOwnWorkspace(row, approved.workspaceId);
    return mapTask(row);
  }
}
