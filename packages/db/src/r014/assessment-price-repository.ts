import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, accountScopeClause, accountScopeParams, approveAuth,
  inTransaction, lockWorkspaceMembership,
} from "./workspace-authority.js";

/**
 * v1.5 `POST /tasks/:id/assessment-price`（v1.9.19 归 be2）。
 *
 * 一期的「重算」按 arch 的口径**不跑批**：只写一行价，派生指标读时按当日生效价算。
 * `recomputedDays` = 生效日至今的天数——它表示「有多少天的派生指标会跟着变」，
 * 不是「已经重算了多少天」，两者差一个字但含义完全不同。
 */
export interface AssessmentPriceChange {
  taskId: string;
  oldPrice: number | null;
  newPrice: number;
  effectiveDate: string;
  recomputedDays: number;
  notifiedUserIds: string[];
}

const MAX_PRICE = 1_000_000;

export class AssessmentPriceRepository {
  constructor(private readonly pool: Pool) {}

  async change(
    auth: ApprovedWorkspaceAuthContext,
    taskId: string,
    input: { price: unknown; effectiveDate: unknown; evidenceUrl?: unknown },
  ): Promise<AssessmentPriceChange> {
    const approved = approveAuth(auth);
    // Freeze caller input before the first await.
    const price = Number(input.price);
    const effectiveDate = String(input.effectiveDate ?? "");
    const evidenceUrl = input.evidenceUrl === undefined || input.evidenceUrl === null
      ? null : String(input.evidenceUrl);

    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    // 价必须是正的有限数：0 或负数会让「达标」判定失去意义，而不是判成不达标。
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new R014RepositoryError("INVALID_INPUT");
    if (evidenceUrl !== null && (evidenceUrl.length === 0 || evidenceUrl.length > 2_048)) {
      throw new R014RepositoryError("INVALID_INPUT");
    }

    const scope = accountScopeParams(approved);
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);

      // 与任务详情同一口径：看不见这个任务的人也不能改它的考核价。
      const task = (await client.query(
        `SELECT task.owner_user_id
         FROM tasks AS task
         WHERE task.workspace_id=$1 AND task.task_id=$2
           AND ($3::text = 'team_workspace_readonly' OR EXISTS (
             SELECT 1 FROM task_accounts AS relation
             WHERE relation.workspace_id=task.workspace_id AND relation.task_id=task.task_id
               AND ${accountScopeClause("$3", "$4", "relation.media", "relation.account_id")}))
         FOR SHARE OF task`,
        [approved.workspaceId, taskId, scope.kind, scope.allowed],
      )).rows[0] as { owner_user_id: string | null } | undefined;
      // 看不见与不存在一律 404：分开等于告诉外人这个任务存在。
      if (task === undefined) throw new R014RepositoryError("NOT_FOUND");

      const previous = (await client.query(
        `SELECT price FROM assessment_price_history
         WHERE workspace_id=$1 AND task_id=$2 AND effective_date <= $3::date
         ORDER BY effective_date DESC, id DESC LIMIT 1`,
        [approved.workspaceId, taskId, effectiveDate],
      )).rows[0] as { price: unknown } | undefined;
      const oldPrice = previous === undefined ? null : Number(previous.price);
      // 改成同一个价 = 什么也没变：不写行、不发通知，免得历史里堆一串无意义的「调整」。
      if (oldPrice !== null && oldPrice === price) {
        throw new R014RepositoryError("CONFLICT");
      }

      await client.query(
        `INSERT INTO assessment_price_history(workspace_id, task_id, price, effective_date, changed_by, evidence_url)
         VALUES($1,$2,$3,$4::date,$5,$6)`,
        [approved.workspaceId, taskId, price, effectiveDate, approved.userId, evidenceUrl],
      );

      const recomputedDays = Number((await client.query(
        // 生效日在将来时是 0 天：还没有任何一天的指标会因此改变。
        "SELECT GREATEST((CURRENT_DATE - $1::date) + 1, 0)::int AS days", [effectiveDate],
      )).rows[0].days);

      // 通知任务 owner（v1.9.19：走交接那套出站消息）。没有 owner 就没人可通知，
      // 回空数组而不是发给改价的人自己——那是通知一件他自己刚做的事。
      const notified = task.owner_user_id === null ? [] : [task.owner_user_id];
      for (const userId of notified) {
        await client.query(
          `INSERT INTO outbound_messages(workspace_id, channel, target, kind, payload, status)
           VALUES($1,'inbox',$2,'assessment_price',$3::jsonb,'queued')`,
          [approved.workspaceId, userId, JSON.stringify({
            taskId, oldPrice, newPrice: price, effectiveDate, recomputedDays,
          })],
        );
      }

      return { taskId, oldPrice, newPrice: price, effectiveDate, recomputedDays, notifiedUserIds: notified };
    });
  }
}
