import { approvedWorkspaceAuthContextSchema, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

// be2-r014 自用的权限回查件。刻意复制而不是改 be 的共享 helper：
// 所有权边界要求 be2 需要不同行为时自带一份（分工文档 §2）。
export type R014ErrorCode =
  | "FORBIDDEN" | "INVALID_INPUT" | "INVALID_RESULT" | "NOT_FOUND" | "CONFLICT"
  /** 当前密码不正确（v1.9.9 F-Q024-1）。与 FORBIDDEN 分开，是因为前端要认这一种走「密码错」分支。 */
  | "INVALID_CREDENTIALS";

export class R014RepositoryError extends Error {
  constructor(readonly code: R014ErrorCode) {
    super(`R014 repository ${code.toLowerCase()}`);
    this.name = "R014RepositoryError";
  }
}

export function approveAuth(auth: ApprovedWorkspaceAuthContext): ApprovedWorkspaceAuthContext {
  const parsed = approvedWorkspaceAuthContextSchema.safeParse(auth);
  if (!parsed.success) throw new R014RepositoryError("FORBIDDEN");
  return parsed.data;
}

/**
 * Scope 来自 Session，但 Session 是快照：成员被移除/身份被停用/空间被停用之后，
 * 旧快照不得再授权一次写入。每次事务开头按 live 表重新验一遍并 FOR SHARE 锁住。
 */
export async function lockWorkspaceMembership(
  client: PoolClient,
  auth: ApprovedWorkspaceAuthContext,
): Promise<void> {
  const result = await client.query(
    `SELECT true AS allowed FROM workspaces AS workspace
     JOIN users AS actor ON actor.workspace_id=workspace.id AND actor.id=$2 AND actor.is_active=true
     JOIN workspace_memberships AS member ON member.workspace_id=workspace.id
       AND member.user_id=actor.id AND member.is_active=true AND member.role=$3
     JOIN auth_identities AS identity ON identity.id=member.identity_id AND identity.is_active=true
     WHERE workspace.id=$1 AND workspace.kind=$4 AND workspace.is_active=true
     LIMIT 2 FOR SHARE OF workspace, actor, member, identity`,
    [auth.workspaceId, auth.userId, auth.role, auth.workspaceKind],
  );
  if (result.rows.length !== 1 || result.rows[0]?.allowed !== true) throw new R014RepositoryError("FORBIDDEN");
}

/** 身份级资源（identity_preferences）只认 live 的、未停用的身份。 */
export async function lockActiveIdentity(client: PoolClient, identityId: string): Promise<void> {
  const result = await client.query(
    "SELECT true AS allowed FROM auth_identities WHERE id=$1 AND is_active=true LIMIT 2 FOR SHARE",
    [identityId],
  );
  if (result.rows.length !== 1 || result.rows[0]?.allowed !== true) throw new R014RepositoryError("FORBIDDEN");
}

export async function inTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve original failure; never log source details. */ }
    throw error;
  } finally {
    client.release();
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new R014RepositoryError("INVALID_INPUT");
  return value;
}

/** 回读的行必须落在本空间：防止查询写错时把别人的行当成自己的返回。 */
export function requireOwnWorkspace(row: Record<string, unknown>, workspaceId: string): void {
  if (row.workspace_id !== workspaceId) throw new R014RepositoryError("INVALID_RESULT");
}

export function requireTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new R014RepositoryError("INVALID_RESULT");
  return value;
}

/**
 * 会话上下文里没有 identityId（approvedWorkspaceAuthContextSchema 是 strict 的，只有五个键），
 * 但 identity 级资源（identity_preferences / 通知已读态）需要它 —— 从 live 成员关系反查，
 * 顺带保证这个人现在还是这个空间的在册成员。
 */
export async function resolveIdentityId(
  executor: Pool | PoolClient,
  auth: ApprovedWorkspaceAuthContext,
): Promise<string> {
  const approved = approveAuth(auth);
  const result = await executor.query(
    `SELECT member.identity_id FROM workspace_memberships AS member
     JOIN auth_identities AS identity ON identity.id=member.identity_id AND identity.is_active=true
     WHERE member.workspace_id=$1 AND member.user_id=$2 AND member.is_active=true LIMIT 2`,
    [approved.workspaceId, approved.userId],
  );
  if (result.rows.length !== 1) throw new R014RepositoryError("FORBIDDEN");
  return requireUuid((result.rows[0] as { identity_id: unknown }).identity_id);
}

/**
 * ── 账户 scope 谓词（Q-020 之后统一收在这里）────────────────────────────────
 *
 * 同一段「这个账户是不是他的」判断，之前在任务列表、任务详情、日报各写了一份。
 * 安全谓词散着写，改一处漏三处，Q-020 和日报那两次漏检都是这么来的。这里出一份，
 * 各仓储引用同一个。
 *
 * 口径：团队空间是只读全量不收口；个人空间必须命中会话 scope 里的 (media, account_id)。
 * scope 由会话解析时按 live 授权重算且已排除 `revoked_at`，撤权下一次请求即生效。
 */
export interface AccountScopeParams { kind: string; allowed: string }

export function accountScopeParams(auth: ApprovedWorkspaceAuthContext): AccountScopeParams {
  const approved = approveAuth(auth);
  return {
    kind: approved.scope.kind,
    allowed: JSON.stringify(approved.scope.kind === "explicit_accounts"
      ? approved.scope.accounts.map((account) => ({ media: account.media, account_id: account.accountId }))
      : []),
  };
}

/** 账户维度的表：行上的 (media, account_id) 必须在 scope 里。 */
export function accountScopeClause(
  kindParam: string, listParam: string, mediaExpression: string, accountExpression: string,
): string {
  return `(${kindParam}::text = 'team_workspace_readonly' OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(${listParam}::jsonb) AS scoped(media text, account_id text)
    WHERE scoped.media = ${mediaExpression} AND scoped.account_id = ${accountExpression}))`;
}

/**
 * 工作项：账户级的按 (media, account_id) 收口；**任务级的（account 为空）看任务**——
 * 该任务下只要有一个他授权的账户就算他能看见，与任务列表同口径。
 * 两者都不沾的（账户任务都为空）不返回：无法归属给任何人的工作项，不该出现在个人视图里。
 */
export function workItemScopeClause(kindParam: string, listParam: string, alias: string): string {
  return `(${kindParam}::text = 'team_workspace_readonly' OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(${listParam}::jsonb) AS scoped(media text, account_id text)
    WHERE scoped.media = ${alias}.media AND scoped.account_id = ${alias}.account_id)
    OR (${alias}.account_id IS NULL AND ${alias}.task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM task_accounts AS scoped_link
      JOIN jsonb_to_recordset(${listParam}::jsonb) AS scoped_tuple(media text, account_id text)
        ON scoped_tuple.media = scoped_link.media AND scoped_tuple.account_id = scoped_link.account_id
      WHERE scoped_link.workspace_id = ${alias}.workspace_id AND scoped_link.task_id = ${alias}.task_id)))`;
}
