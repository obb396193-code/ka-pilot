import {
  reportRunKindSchema, reportRunRefSchema, reportRunSchema, reportRunStatusSchema,
  type ApprovedWorkspaceAuthContext, type ReportRun, type ReportRunRef,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, requireOwnWorkspace, requireTimestamp, requireUuid,
} from "./workspace-authority.js";

/**
 * v1.5 1.8 / 3.10 生成记录。写侧是 **Worker 系统身份**（早报 job / 定时推 job），没有 Session，
 * 与 job-repository 等既有 Worker 仓储一致；读侧才按 Session 限本人。
 * 表上 UNIQUE(workspace_id,user_id,kind,ref) 就是幂等键：同一天同一人只会有一条早报 run。
 */
export interface StartReportRunInput {
  workspaceId: string;
  userId: string | null;
  kind: ReportRun["kind"];
  ref: ReportRunRef;
}

export interface FinishReportRunInput {
  status: Exclude<ReportRun["status"], "pending_data" | "running">;
  dataAsOf?: string | null;
  outputRef?: string | null;
  error?: string | null;
}

const COLUMNS = "id, workspace_id, user_id, kind, ref, status, data_as_of, output_ref, error, created_at, finished_at";

function mapRow(row: Record<string, unknown>, workspaceId: string): ReportRun {
  requireOwnWorkspace(row, workspaceId);
  const parsed = reportRunSchema.safeParse({
    runId: row.id,
    kind: row.kind,
    ref: row.ref,
    status: row.status,
    dataAsOf: row.data_as_of === null ? null : requireTimestamp(row.data_as_of).toISOString(),
    outputRef: (row.output_ref as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: requireTimestamp(row.created_at).toISOString(),
    finishedAt: row.finished_at === null ? null : requireTimestamp(row.finished_at).toISOString(),
  });
  if (!parsed.success) throw new R014RepositoryError("INVALID_RESULT");
  return parsed.data;
}

export class ReportRunRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * 幂等开工：同一 (workspace,user,kind,ref) 重复触发返回既有那条，不再生成第二份。
   * 起手状态由调用方给——数据没到就 pending_data，**不先建一条 running 再假装在算**。
   */
  async start(input: StartReportRunInput, status: "pending_data" | "running"): Promise<ReportRun> {
    const workspaceId = requireUuid(input.workspaceId);
    const userId = input.userId === null ? null : requireUuid(input.userId);
    const kind = reportRunKindSchema.safeParse(input.kind);
    const ref = reportRunRefSchema.safeParse(input.ref);
    const parsedStatus = reportRunStatusSchema.safeParse(status);
    if (!kind.success || !ref.success || !parsedStatus.success) throw new R014RepositoryError("INVALID_INPUT");
    const fixed = { workspaceId, userId, kind: kind.data, ref: ref.data, status: parsedStatus.data };
    return inTransaction(this.pool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO report_runs (workspace_id, user_id, kind, ref, status)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT (workspace_id, user_id, kind, ref) DO NOTHING
         RETURNING ${COLUMNS}`,
        [fixed.workspaceId, fixed.userId, fixed.kind, JSON.stringify(fixed.ref), fixed.status],
      );
      if (inserted.rows.length === 1) return mapRow(inserted.rows[0] as Record<string, unknown>, fixed.workspaceId);
      const existing = await client.query(
        `SELECT ${COLUMNS} FROM report_runs
         WHERE workspace_id=$1 AND user_id IS NOT DISTINCT FROM $2 AND kind=$3 AND ref=$4::jsonb`,
        [fixed.workspaceId, fixed.userId, fixed.kind, JSON.stringify(fixed.ref)],
      );
      if (existing.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      return mapRow(existing.rows[0] as Record<string, unknown>, fixed.workspaceId);
    });
  }

  async finish(workspaceId: string, runId: string, input: FinishReportRunInput): Promise<ReportRun> {
    const workspace = requireUuid(workspaceId);
    const id = requireUuid(runId);
    if (input.status !== "ready" && input.status !== "failed") throw new R014RepositoryError("INVALID_INPUT");
    const fixed = {
      status: input.status,
      dataAsOf: input.dataAsOf ?? null,
      outputRef: input.outputRef ?? null,
      error: input.error ?? null,
    };
    const result = await this.pool.query(
      `UPDATE report_runs SET status=$3, data_as_of=$4::timestamptz, output_ref=$5, error=$6, finished_at=now()
       WHERE id=$2 AND workspace_id=$1 AND finished_at IS NULL
       RETURNING ${COLUMNS}`,
      [workspace, id, fixed.status, fixed.dataAsOf, fixed.outputRef, fixed.error],
    );
    // 已终态的 run 不许被改写：早报发出去之后再改内容会让人对不上账。
    if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
    return mapRow(result.rows[0] as Record<string, unknown>, workspace);
  }

  /** 读侧按 Session：只看得到自己的 run（user_id 为空的空间级 run 也算本人可见）。 */
  async findForUser(auth: ApprovedWorkspaceAuthContext, kind: ReportRun["kind"], ref: ReportRunRef): Promise<ReportRun | null> {
    const approved = approveAuth(auth);
    const parsedKind = reportRunKindSchema.safeParse(kind);
    const parsedRef = reportRunRefSchema.safeParse(ref);
    if (!parsedKind.success || !parsedRef.success) throw new R014RepositoryError("INVALID_INPUT");
    const result = await this.pool.query(
      `SELECT ${COLUMNS} FROM report_runs
       WHERE workspace_id=$1 AND kind=$3 AND ref=$4::jsonb AND (user_id=$2 OR user_id IS NULL)
       ORDER BY user_id NULLS LAST LIMIT 1`,
      [approved.workspaceId, approved.userId, parsedKind.data, JSON.stringify(parsedRef.data)],
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
  }
}
