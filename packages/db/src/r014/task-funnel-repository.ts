import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, accountScopeClause, accountScopeParams, approveAuth,
} from "./workspace-authority.js";

/**
 * v1.5 `GET /tasks/:id/funnel`（八页签之一）。线上链路取 canonical 日表，
 * **线下链路来源 `account_offline`——那张表还没建**，所以 `wakeUv/potentialUv` 与
 * 依赖它们的两个比率一律 missing/undefined，不拿线上数顶替。
 *
 * 账户维度一律过授权谓词：任务过闸不等于任务下每个户他都看得见。
 */
export interface TaskFunnelFacts {
  online: { exposure: number | null; click: number | null; conversion: number | null; realConversion: number | null };
  offlineAvailable: boolean;
}

export class TaskFunnelRepository {
  constructor(private readonly pool: Pool) {}

  async facts(
    auth: ApprovedWorkspaceAuthContext, taskId: string, dateFrom: string, dateTo: string,
  ): Promise<TaskFunnelFacts> {
    const approved = approveAuth(auth);
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    for (const date of [dateFrom, dateTo]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new R014RepositoryError("INVALID_INPUT");
    }
    if (dateFrom > dateTo) throw new R014RepositoryError("INVALID_INPUT");
    const scope = accountScopeParams(approved);

    const row = (await this.pool.query(
      `SELECT sum(source.exposure) AS exposure, sum(source.click) AS click,
              sum(source.conversion) AS conversion, sum(source.real_conversion) AS real_conversion
       FROM account_metrics_daily AS source
       JOIN task_accounts AS link ON link.workspace_id=source.workspace_id
         AND link.media=source.media AND link.account_id=source.account_id AND link.task_id=$2
         AND link.valid_from <= source.ds AND (link.valid_to IS NULL OR link.valid_to >= source.ds)
       WHERE source.workspace_id=$1 AND source.ds BETWEEN $3::date AND $4::date
         AND ${accountScopeClause("$5", "$6", "source.media", "source.account_id")}`,
      [approved.workspaceId, taskId, dateFrom, dateTo, scope.kind, scope.allowed],
    )).rows[0] as Record<string, unknown>;

    const number = (value: unknown): number | null => (value === null ? null : Number(value));
    return {
      online: {
        exposure: number(row.exposure), click: number(row.click),
        conversion: number(row.conversion), realConversion: number(row.real_conversion),
      },
      // 线下链路的表不在 = 整条链路无源，不是「这个任务没有线下量」。
      offlineAvailable: (await this.pool.query(
        "SELECT to_regclass('public.account_offline') AS name")).rows[0]?.name !== null,
    };
  }
}
